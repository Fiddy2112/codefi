import { logger } from '@/services/logger';
import { audioService } from '@/services/audio';
import { COLORS } from '@/utils/constants';
import chalk from 'chalk';
import { Command } from 'commander';

// ─── Commands ─────────────────────────────────────────────────────────────────
// Playback
import playCommand     from '@/commands/play';
import stopCommand     from '@/commands/stop';
import statusCommand   from '@/commands/status';
import volumeCommand   from '@/commands/volume';
import moodCommand     from '@/commands/mood';
import queueCommand    from '@/commands/queue';
import sleepCommand    from '@/commands/sleep';

// Library & history
import playlistCommand from '@/commands/playlist';
import historyCommand  from '@/commands/history';

// Integrations
import { spotifyCommand } from '@/commands/spotify';

// Productivity
import pomodoroCommand from '@/commands/pomodoro';

// Account & settings
import loginCommand    from '@/commands/login';
import logoutCommand   from '@/commands/logout';
import configCommand   from '@/commands/config';
import aliasCommand, { runAlias }    from '@/commands/alias';
import keybindsCommand from '@/commands/keybinds';

// Tools
import shareCommand    from '@/commands/share';
import cacheCommand    from '@/commands/cache';
import updateCommand   from '@/commands/update';
import doctorCommand   from '@/commands/doctor';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson: { version: string } = require('../package.json');

// ─── Program ──────────────────────────────────────────────────────────────────
const program = new Command();

program
  .name('codefi')
  .description(chalk.hex(COLORS.PRIMARY)('Brewing beats for your code'))
  .version(packageJson.version, '-v, --version', 'Output the current version')
  .helpOption('-h, --help', 'Display help for command');

// ─── Register all commands ────────────────────────────────────────────────────
// Playback
program.addCommand(playCommand);
program.addCommand(stopCommand);
program.addCommand(statusCommand);
program.addCommand(volumeCommand);
program.addCommand(moodCommand);
program.addCommand(queueCommand);
program.addCommand(sleepCommand);

// Library
program.addCommand(playlistCommand);
program.addCommand(historyCommand);

// Integrations
program.addCommand(spotifyCommand);

// Productivity
program.addCommand(pomodoroCommand);

// Account & settings
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(configCommand);
program.addCommand(aliasCommand);
program.addCommand(keybindsCommand);

// Tools
program.addCommand(shareCommand);
program.addCommand(cacheCommand);
program.addCommand(updateCommand);
program.addCommand(doctorCommand);

// ─── Help footer ──────────────────────────────────────────────────────────────
program.on('--help', () => {
  console.log('');
  console.log(chalk.hex(COLORS.PRIMARY)('Playback'));
  console.log('  $ codefi play                        # Start playing');
  console.log('  $ codefi play --mood focus           # Pick a mood');
  console.log('  $ codefi play --ai-mood              # AI picks your mood (Pro)');
  console.log('  $ codefi stop                        # Stop music');
  console.log('  $ codefi status                      # What\'s playing now');
  console.log('  $ codefi volume 60                   # Set volume');
  console.log('  $ codefi volume +10                  # Relative adjust');
  console.log('  $ codefi queue add <youtube-url>     # Queue next track');
  console.log('  $ codefi sleep 30                    # Stop after 30 min');
  console.log('');
  console.log(chalk.hex(COLORS.PRIMARY)('Library'));
  console.log('  $ codefi mood                        # Change mood interactively');
  console.log('  $ codefi playlist list               # Browse playlists');
  console.log('  $ codefi playlist create             # Create a playlist (Pro)');
  console.log('  $ codefi history                     # Recently played');
  console.log('  $ codefi history stats               # Listening stats');
  console.log('');
  console.log(chalk.hex(COLORS.PRIMARY)('Productivity'));
  console.log('  $ codefi pomodoro start              # Pomodoro timer (Pro)');
  console.log('  $ codefi spotify connect             # Connect Spotify (Pro)');
  console.log('');
  console.log(chalk.hex(COLORS.PRIMARY)('Settings'));
  console.log('  $ codefi config                      # View/edit settings');
  console.log('  $ codefi config set defaultMood chill');
  console.log('  $ codefi alias set focus "play --mood focus --volume 80"');
  console.log('  $ codefi keybinds                    # View/remap hotkeys');
  console.log('');
  console.log(chalk.hex(COLORS.PRIMARY)('Tools'));
  console.log('  $ codefi share                       # Copy now-playing to clipboard');
  console.log('  $ codefi cache size                  # Show cache disk usage');
  console.log('  $ codefi update                      # Update to latest version');
  console.log('  $ codefi doctor                      # Check environment & deps');
  console.log('');
  console.log(chalk.hex(COLORS.TEXT)('Docs: https://docs.codefi.dev'));
});

// ─── Unknown command — check aliases first ────────────────────────────────────
program.on('command:*', async () => {
  const unknownCmd = program.args[0];

  // Check if it matches a user alias
  const ran = await runAlias(unknownCmd, program.args.slice(1));
  if (ran) return;

  logger.error(`Unknown command: ${program.args.join(' ')}`);
  logger.info('Run "codefi --help" for available commands');
  process.exit(1);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function cleanExit(code = 0): void {
  try { audioService.stop(); } catch {}
  process.exit(code);
}

process.on('SIGTERM', () => cleanExit(0));
process.on('SIGINT',  () => { console.log(''); cleanExit(0); });

process.on('unhandledRejection', (reason) => {
  logger.error(
    'Unhandled error',
    reason instanceof Error ? reason : new Error(String(reason))
  );
  cleanExit(1);
});

// ─── Welcome (no args) ────────────────────────────────────────────────────────
function showWelcome(): void {
  console.log(chalk.hex(COLORS.PRIMARY).bold(`
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║   <|||>  C O D E F I                  ║
  ║          Brewing beats for your code  ║
  ║                                       ║
  ╚═══════════════════════════════════════╝`));
  logger.newLine();
  logger.info('Quick start:');
  logger.info('  $ codefi doctor           # Check your setup first');
  logger.info('  $ codefi play             # Start playing');
  logger.info('  $ codefi status           # What\'s playing');
  logger.info('  $ codefi --help           # All commands');
  logger.newLine();
  logger.info('Docs: https://docs.codefi.dev');
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export function run(): void {
  try {
    program.parse(process.argv);
    if (process.argv.slice(2).length === 0) showWelcome();
  } catch (error) {
    logger.error('CLI error', error as Error);
    cleanExit(1);
  }
}

if (require.main === module) run();