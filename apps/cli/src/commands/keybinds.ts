import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '@/services/logger';
import { COLORS } from '@/utils/constants';

const KEYBINDS_FILE = path.join(os.homedir(), '.codefi', 'keybinds.json');

// ─── Default keybinds ─────────────────────────────────────────────────────────
export interface KeybindMap {
  quit:        string;
  pauseResume: string;
  nextTrack:   string;
  prevTrack:   string;
  volumeUp:    string;
  volumeDown:  string;
  mute:        string;
}

export const DEFAULT_KEYBINDS: KeybindMap = {
  quit:        'q',
  pauseResume: 's',
  nextTrack:   'n',
  prevTrack:   'p',
  volumeUp:    'k',
  volumeDown:  'j',
  mute:        'm',
};

const ACTION_LABELS: Record<keyof KeybindMap, string> = {
  quit:        'Quit player',
  pauseResume: 'Pause / resume',
  nextTrack:   'Next track',
  prevTrack:   'Previous track',
  volumeUp:    'Volume up',
  volumeDown:  'Volume down',
  mute:        'Mute / unmute',
};

// ─── Storage ──────────────────────────────────────────────────────────────────
export function loadKeybinds(): KeybindMap {
  try {
    if (!fs.existsSync(KEYBINDS_FILE)) return { ...DEFAULT_KEYBINDS };
    const saved = JSON.parse(fs.readFileSync(KEYBINDS_FILE, 'utf8')) as Partial<KeybindMap>;
    return { ...DEFAULT_KEYBINDS, ...saved };
  } catch { return { ...DEFAULT_KEYBINDS }; }
}

function saveKeybinds(kb: KeybindMap): void {
  const dir = path.dirname(KEYBINDS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(KEYBINDS_FILE, JSON.stringify(kb, null, 2));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isValidKey(k: string): boolean {
  // Single printable ASCII char (space allowed), or special names
  const specials = new Set(['space', 'enter', 'backspace', 'tab', 'escape', 'up', 'down', 'left', 'right']);
  return (k.length === 1 && k.charCodeAt(0) >= 32 && k.charCodeAt(0) < 127)
    || specials.has(k.toLowerCase());
}

function findConflict(keybinds: KeybindMap, key: string, excludeAction: keyof KeybindMap): keyof KeybindMap | null {
  for (const [action, bound] of Object.entries(keybinds) as [keyof KeybindMap, string][]) {
    if (action !== excludeAction && bound === key) return action;
  }
  return null;
}

function renderKeybinds(keybinds: KeybindMap): void {
  logger.newLine();
  logger.box('KEYBINDS');
  logger.newLine();

  for (const [action, key] of Object.entries(keybinds) as [keyof KeybindMap, string][]) {
    const isDefault = DEFAULT_KEYBINDS[action] === key;
    const keyDisplay = key === ' ' ? 'space' : key;
    const tag = isDefault ? chalk.gray('(default)') : chalk.hex(COLORS.PRIMARY)('(custom)');

    console.log(
      chalk.gray(`  ${ACTION_LABELS[action].padEnd(20)} `) +
      chalk.white.bold(` ${keyDisplay} `.padEnd(10)) +
      tag
    );
  }

  logger.newLine();
  logger.info('Arrow keys (↑ ↓ ← →) always work for volume and tracks regardless of keybinds');
  logger.newLine();
}

// ─── Sub-commands ─────────────────────────────────────────────────────────────

const showCommand = new Command('show')
  .description('Show current keybinds')
  .action(() => {
    renderKeybinds(loadKeybinds());
  });

const setCommand = new Command('set')
  .description('Remap a key')
  .argument('<action>', `Action to remap: ${Object.keys(DEFAULT_KEYBINDS).join(', ')}`)
  .argument('<key>',    'New key (single char, or: space, up, down, left, right, escape)')
  .action((action: string, key: string) => {
    if (!(action in DEFAULT_KEYBINDS)) {
      logger.error(`Unknown action: "${action}"`);
      logger.info(`Valid actions: ${Object.keys(DEFAULT_KEYBINDS).join(', ')}`);
      process.exit(1);
    }

    const normalised = key.toLowerCase();
    if (!isValidKey(normalised)) {
      logger.error(`Invalid key: "${key}". Use a single character or: space, up, down, left, right, escape`);
      process.exit(1);
    }

    const keybinds = loadKeybinds();
    const conflict = findConflict(keybinds, normalised, action as keyof KeybindMap);
    if (conflict) {
      logger.error(`"${key}" is already used for "${ACTION_LABELS[conflict]}"`);
      logger.info('Choose a different key or unset the other binding first');
      process.exit(1);
    }

    keybinds[action as keyof KeybindMap] = normalised;
    saveKeybinds(keybinds);

    logger.newLine();
    logger.success(`${ACTION_LABELS[action as keyof KeybindMap]} → ${key === ' ' ? 'space' : key}`);
    logger.newLine();
  });

const resetCommand = new Command('reset')
  .description('Reset all keybinds to defaults')
  .action(async () => {
    const { default: inquirer } = await import('inquirer');
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: 'Reset all keybinds to defaults?',
      default: false,
    }]);
    if (!confirmed) { logger.info('Cancelled'); return; }
    saveKeybinds({ ...DEFAULT_KEYBINDS });
    logger.success('Keybinds reset to defaults');
    renderKeybinds(DEFAULT_KEYBINDS);
  });

// ─── Root keybinds command ────────────────────────────────────────────────────
export const keybindsCommand = new Command('keybinds')
  .description('View and remap keyboard shortcuts')
  .addCommand(showCommand)
  .addCommand(setCommand)
  .addCommand(resetCommand)
  .action(() => {
    renderKeybinds(loadKeybinds());
  });

export default keybindsCommand;