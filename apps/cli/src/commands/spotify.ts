import { Command } from 'commander';
import { logger } from '../services/logger';
import { spotifyService } from '../services/spotify';
import { configService } from '../services/config';

export const spotifyCommand = new Command('spotify')
  .description('Manage Spotify integration (Pro)')
  .addCommand(
    new Command('connect')
      .description('Connect Spotify account')
      .action(async () => {
        try {
          if (!configService.isPro()) {
            logger.proRequired();
            return;
          }

          await spotifyService.connect();
        } catch (error: any) {
          logger.error('Failed to connect Spotify', error);
        }
      })
  )
  .addCommand(
    new Command('disconnect')
      .description('Disconnect Spotify account')
      .action(() => {
        spotifyService.disconnect();
      })
  )
  .addCommand(
    new Command('status')
      .description('Check Spotify connection status')
      .action(() => {
        if (spotifyService.isConnected()) {
          logger.success('✓ Spotify connected');
        } else {
          logger.info('Spotify not connected');
          logger.info('Run: codefi spotify connect');
        }
      })
  );

export default spotifyCommand;