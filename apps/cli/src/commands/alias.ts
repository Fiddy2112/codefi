import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '@/services/logger';
import { COLORS } from '@/utils/constants';
import { run } from '@/index';

const ALIAS_FILE = path.join(os.homedir(), '.codefi', 'aliases.json');

type AliasMap = Record<string, string>;

// ─── Storage ──────────────────────────────────────────────────────────────────
function loadAliases(): AliasMap {
  try {
    if (!fs.existsSync(ALIAS_FILE)) return {};
    return JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8')) as AliasMap;
  } catch { return {}; }
}

function saveAliases(aliases: AliasMap): void {
  const dir = path.dirname(ALIAS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ALIAS_FILE, JSON.stringify(aliases, null, 2));
}

// Reserved command names that cannot be used as alias names
const RESERVED = new Set([
  'play','stop','mood','status','volume','vol','config','login','logout',
  'pomodoro','playlist','history','update','doctor','queue','sleep','alias',
  'share','cache','keybinds','spotify','--help','-h','--version','-v',
]);

// ─── Run an alias ─────────────────────────────────────────────────────────────
// Called from index.ts when argv[2] matches a known alias
export async function runAlias(name: string, extraArgs: string[]): Promise<boolean> {
  const aliases = loadAliases();
  const cmd = aliases[name];
  if (!cmd) return false;

  // Expand: "codefi <expanded> <extraArgs>"
  const expanded = `${cmd} ${extraArgs.join(' ')}`.trim();
  logger.info(`alias ${name} → codefi ${expanded}`);

  // Re-parse through the program
  process.argv = ['node', 'codefi', ...expanded.split(/\s+/)];
  run();
  return true;
}

// ─── Sub-commands ─────────────────────────────────────────────────────────────

const listCommand = new Command('list')
  .description('List all aliases')
  .action(() => {
    const aliases = loadAliases();
    const entries = Object.entries(aliases);

    logger.newLine();
    if (entries.length === 0) {
      logger.info('No aliases defined yet');
      logger.info('Create one: codefi alias set focus "play --mood focus --volume 80"');
      logger.newLine();
      return;
    }

    logger.box(`ALIASES (${entries.length})`);
    logger.newLine();

    entries.forEach(([name, cmd]) => {
      console.log(
        chalk.hex(COLORS.PRIMARY)(`  codefi ${name.padEnd(16)}`) +
        chalk.gray('→  codefi ') +
        chalk.white(cmd)
      );
    });

    logger.newLine();
    logger.info('Run any alias directly: codefi <alias-name>');
    logger.newLine();
  });

const setCommand = new Command('set')
  .description('Create or update an alias')
  .argument('<name>',    'Alias name (e.g. focus)')
  .argument('<command>', 'Command to run (e.g. "play --mood focus --volume 80")')
  .action((name: string, cmd: string) => {
    // Validate name
    if (RESERVED.has(name)) {
      logger.error(`"${name}" is a reserved command name and cannot be used as an alias`);
      process.exit(1);
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      logger.error('Alias name must start with a letter and contain only letters, numbers, _ or -');
      process.exit(1);
    }
    if (name.length > 32) {
      logger.error('Alias name must be 32 characters or fewer');
      process.exit(1);
    }

    // Validate command starts with a known codefi sub-command
    const firstWord = cmd.trim().split(/\s+/)[0];
    if (RESERVED.has(firstWord) === false && firstWord !== 'play') {
      logger.warning(`Command starts with "${firstWord}" — make sure it's a valid codefi command`);
    }

    const aliases = loadAliases();
    const isUpdate = !!aliases[name];
    aliases[name] = cmd.trim();
    saveAliases(aliases);

    logger.newLine();
    if (isUpdate) {
      logger.success(`Updated alias: codefi ${name} → codefi ${cmd}`);
    } else {
      logger.success(`Created alias: codefi ${name}`);
      console.log(chalk.gray(`  Runs: codefi ${cmd}`));
    }
    logger.newLine();
  });

const removeCommand = new Command('remove')
  .alias('rm')
  .description('Delete an alias')
  .argument('<name>', 'Alias name to remove')
  .action((name: string) => {
    const aliases = loadAliases();
    if (!aliases[name]) {
      logger.error(`Alias not found: "${name}"`);
      process.exit(1);
    }
    delete aliases[name];
    saveAliases(aliases);
    logger.success(`Removed alias: ${name}`);
  });

const runCommand = new Command('run')
  .description('Run an alias by name')
  .argument('<name>',        'Alias name')
  .argument('[args...]',     'Extra arguments to append')
  .action(async (name: string, args: string[]) => {
    const ran = await runAlias(name, args);
    if (!ran) {
      logger.error(`Alias not found: "${name}"`);
      logger.info('List aliases with: codefi alias list');
      process.exit(1);
    }
  });

// ─── Root alias command ───────────────────────────────────────────────────────
export const aliasCommand = new Command('alias')
  .description('Create shortcuts for frequently used commands')
  .addCommand(listCommand)
  .addCommand(setCommand)
  .addCommand(removeCommand)
  .addCommand(runCommand)
  .action(() => {
    listCommand.parseAsync([], { from: 'user' });
  });

export default aliasCommand;