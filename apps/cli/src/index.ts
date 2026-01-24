import { logger } from "@/services/logger";
import { COLORS } from "@/utils/constants";
import chalk from "chalk";
import { Command } from "commander";

// commands
import loginCommand from "@/commands/login";
import logoutCommand from "@/commands/logout";
import moodCommand from "@/commands/mood";
import playCommand from "@/commands/play";
import pomodoroCommand from "@/commands/pomodoro";
import stopCommand from "@/commands/stop";

// Read package.json for version
const packageJson = require('../package.json');

// Create CLI program
const program = new Command();

program.name('codefi').description(chalk.hex(COLORS.PRIMARY)('Brewing beats for your code')).version(packageJson.version, '-v, --version', 'Output the current version').helpOption('-h, --help', 'Display help for command');

// Add Command
program.addCommand(playCommand);
program.addCommand(stopCommand);
program.addCommand(moodCommand);
program.addCommand(pomodoroCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);

// Custom help
program.on('--help', () => {
    console.log('');
    console.log(chalk.hex(COLORS.PRIMARY)('Examples:'));
    console.log('  $ codefi play                    # Start playing with default mood');
    console.log('  $ codefi play --mood focus       # Play with focus mood');
    console.log('  $ codefi mood                    # Select mood interactively');
    console.log('  $ codefi pomodoro start          # Start Pomodoro timer (Pro)');
    console.log('  $ codefi login                   # Login to Pro account');
    console.log('');
    console.log(chalk.hex(COLORS.TEXT)('Learn more: https://docs.codefi.dev'));
});

// Handle unknown commands
program.on('command:*', () => {
    logger.error(`Invalid command: ${program.args.join(' ')}`);
    logger.info('Run "codefi --help" for a list of available commands');
    process.exit(1);
});

// Export run function
export function run() {
    try {
      program.parse(process.argv);
  
      // Show help if no command provided
      if (!process.argv.slice(2).length) {
        logger.welcome();
        logger.newLine();
        logger.info('Quick start:');
        logger.info('  $ codefi play          # Start playing music');
        logger.info('  $ codefi mood          # Select your coding mood');
        logger.info('  $ codefi --help        # Show all commands');
        logger.newLine();
        logger.info('Documentation: https://docs.codefi.dev');
      }
    } catch (error) {
      logger.error('CLI error', error as Error);
      process.exit(1);
    }
}

// Run CLI if this is the main module
if (require.main === module) {
    run();
}