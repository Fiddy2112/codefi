import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { configService } from '@/services/config';
import { logger } from '@/services/logger';
import { COLORS, MOODS } from '@/utils/constants';
import type { UserConfig, MoodType } from '@/types';

// Keys that are safe to display / edit via this command
// Sensitive fields (token, refreshToken, etc.) are intentionally excluded
const EDITABLE_KEYS: Array<{
  key: keyof UserConfig;
  label: string;
  type: 'boolean' | 'number' | 'mood' | 'string';
  description: string;
}> = [
  { key: 'defaultMood',            label: 'Default mood',           type: 'mood',    description: 'Mood used when no --mood flag is passed' },
  { key: 'defaultVolume',          label: 'Default volume',         type: 'number',  description: '0–100' },
  { key: 'notifications',          label: 'Notifications',          type: 'boolean', description: 'Desktop notifications for Pomodoro' },
  { key: 'autoStartPomodoro',      label: 'Auto-start music',       type: 'boolean', description: 'Resume music automatically after Pomodoro break' },
  { key: 'pomodoroWorkDuration',   label: 'Pomodoro work (min)',    type: 'number',  description: '1–180 minutes' },
  { key: 'pomodoroBreakDuration',  label: 'Pomodoro break (min)',   type: 'number',  description: '1–60 minutes' },
];

// Pretty-print the full config (hide sensitive keys)
function printConfig(): void {
  const cfg = configService.getAll();
  const email   = cfg.userId ?? '—';
  const plan    = cfg.isPro ? chalk.hex(COLORS.PRIMARY)('Pro ✓') : chalk.gray('Free');
  const spotify = cfg.spotifyConnected ? chalk.hex(COLORS.PRIMARY)('connected') : chalk.gray('not connected');

  logger.box('CODEFI CONFIG');
  logger.newLine();

  // Account block
  console.log(chalk.hex(COLORS.PRIMARY)('  Account'));
  console.log(chalk.gray(`  ${'User'.padEnd(26)} ${email}`));
  console.log(chalk.gray(`  ${'Plan'.padEnd(26)} `) + plan);
  console.log(chalk.gray(`  ${'Spotify'.padEnd(26)} `) + spotify);
  logger.newLine();

  // Settings block
  console.log(chalk.hex(COLORS.PRIMARY)('  Settings'));
  for (const { key, label, type } of EDITABLE_KEYS) {
    const raw = cfg[key];
    let display: string;
    if (type === 'boolean') {
      display = raw ? chalk.hex(COLORS.SUCCESS)('on') : chalk.gray('off');
    } else if (type === 'mood') {
      const m = MOODS[raw as MoodType];
      display = m ? `${m.emoji}  ${m.name}` : String(raw);
    } else {
      display = chalk.white(String(raw ?? '—'));
    }
    console.log(chalk.gray(`  ${label.padEnd(26)} `) + display);
  }

  logger.newLine();
  console.log(chalk.gray(`  Config dir: ${configService.getConfigDir()}`));
  logger.newLine();
}

// ─── Sub-command: show ────────────────────────────────────────────────────────
const showCommand = new Command('show')
  .description('Show all current settings')
  .action(() => {
    printConfig();
  });

// ─── Sub-command: get ─────────────────────────────────────────────────────────
const getCommand = new Command('get')
  .description('Get the value of a setting')
  .argument('<key>', 'Setting key (e.g. defaultMood, defaultVolume)')
  .action((key: string) => {
    const found = EDITABLE_KEYS.find((k) => k.key === key);
    if (!found) {
      logger.error(`Unknown key: ${key}`);
      logger.info(`Available keys: ${EDITABLE_KEYS.map((k) => k.key).join(', ')}`);
      process.exit(1);
    }
    const value = configService.get(found.key);
    console.log(chalk.white(String(value)));
  });

// ─── Sub-command: set ─────────────────────────────────────────────────────────
const setCommand = new Command('set')
  .description('Set the value of a setting')
  .argument('<key>', 'Setting key')
  .argument('<value>', 'New value')
  .action((key: string, value: string) => {
    const found = EDITABLE_KEYS.find((k) => k.key === key);
    if (!found) {
      logger.error(`Unknown key: "${key}"`);
      logger.info(`Available keys: ${EDITABLE_KEYS.map((k) => k.key).join(', ')}`);
      process.exit(1);
    }

    let parsed: UserConfig[typeof found.key];

    if (found.type === 'boolean') {
      if (!['true', 'false', '1', '0', 'on', 'off'].includes(value.toLowerCase())) {
        logger.error(`"${key}" expects true/false`);
        process.exit(1);
      }
      parsed = ['true', '1', 'on'].includes(value.toLowerCase()) as any;

    } else if (found.type === 'number') {
      const n = Number(value);
      if (isNaN(n)) {
        logger.error(`"${key}" expects a number`);
        process.exit(1);
      }
      if (key === 'defaultVolume' && (n < 0 || n > 100)) {
        logger.error('Volume must be between 0 and 100');
        process.exit(1);
      }
      if (key === 'pomodoroWorkDuration' && (n < 1 || n > 180)) {
        logger.error('Work duration must be between 1 and 180 minutes');
        process.exit(1);
      }
      if (key === 'pomodoroBreakDuration' && (n < 1 || n > 60)) {
        logger.error('Break duration must be between 1 and 60 minutes');
        process.exit(1);
      }
      parsed = n as any;

    } else if (found.type === 'mood') {
      const moods = Object.keys(MOODS) as MoodType[];
      if (!moods.includes(value as MoodType)) {
        logger.error(`Invalid mood: "${value}"`);
        logger.info(`Available moods: ${moods.join(', ')}`);
        process.exit(1);
      }
      parsed = value as any;

    } else {
      parsed = value as any;
    }

    configService.set(found.key, parsed);
    logger.success(`${found.label} → ${value}`);
  });

// ─── Sub-command: reset ───────────────────────────────────────────────────────
const resetCommand = new Command('reset')
  .description('Reset all settings to defaults (keeps login)')
  .action(async () => {
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: 'Reset all settings to defaults? (Your login will be kept)',
      default: false,
    }]);

    if (!confirmed) {
      logger.info('Reset cancelled');
      return;
    }

    // Preserve auth fields
    const token        = configService.getToken();
    const refreshToken = configService.getRefreshToken();
    const userId       = configService.get('userId');
    const email        = configService.get('email' as any);
    const isPro        = configService.isPro();

    configService.reset();

    // Restore auth
    if (token && userId) {
      configService.login(userId as string, token, refreshToken, email as string ?? '', isPro);
    }

    logger.success('Settings reset to defaults');
    printConfig();
  });

// ─── Sub-command: edit (interactive) ─────────────────────────────────────────
const editCommand = new Command('edit')
  .description('Interactively edit settings')
  .action(async () => {
    logger.clear();
    logger.box('EDIT SETTINGS');
    logger.newLine();

    const questions = EDITABLE_KEYS.map(({ key, label, type, description }) => {
      const current = configService.get(key);

      if (type === 'boolean') {
        return {
          type: 'confirm',
          name: key,
          message: `${label} (${description})`,
          default: Boolean(current),
        };
      }

      if (type === 'mood') {
        return {
          type: 'list',
          name: key,
          message: `${label} (${description})`,
          choices: (Object.entries(MOODS) as [MoodType, typeof MOODS[MoodType]][]).map(
            ([k, v]) => ({ name: `${v.emoji}  ${v.name}`, value: k })
          ),
          default: current,
        };
      }

      // number or string
      return {
        type: 'input',
        name: key,
        message: `${label} (${description})`,
        default: String(current),
        validate: (input: string) => {
          if (type === 'number') {
            const n = Number(input);
            if (isNaN(n)) return 'Please enter a number';
            if (key === 'defaultVolume' && (n < 0 || n > 100)) return '0–100';
            if (key === 'pomodoroWorkDuration' && (n < 1 || n > 180)) return '1–180';
            if (key === 'pomodoroBreakDuration' && (n < 1 || n > 60)) return '1–60';
          }
          return true;
        },
        filter: (input: string) => (type === 'number' ? Number(input) : input),
      };
    });

    const answers = await inquirer.prompt(questions as any);

    // Save all answers
    let changed = 0;
    for (const { key } of EDITABLE_KEYS) {
      const prev = String(configService.get(key));
      const next = String(answers[key]);
      if (prev !== next) {
        configService.set(key, answers[key]);
        changed++;
      }
    }

    logger.newLine();
    if (changed > 0) {
      logger.success(`Saved ${changed} change${changed > 1 ? 's' : ''}`);
    } else {
      logger.info('No changes made');
    }
  });

// ─── Root config command ──────────────────────────────────────────────────────
export const configCommand = new Command('config')
  .description('View and edit CodeFi settings')
  .addCommand(showCommand)
  .addCommand(getCommand)
  .addCommand(setCommand)
  .addCommand(resetCommand)
  .addCommand(editCommand)
  // `codefi config` with no subcommand → show
  .action(() => {
    printConfig();
  });

export default configCommand;