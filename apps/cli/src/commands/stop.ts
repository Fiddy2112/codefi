import { Command } from 'commander';
import { logger }  from '@/services/logger';
import { audioService } from '@/services/audio';
import { isDaemonRunning, sendCommand } from '@/services/ipc';

export const stopCommand = new Command('stop')
  .description('Stop playing music')
  .action(async () => {
    if (isDaemonRunning()) {
      try {
        await sendCommand({ cmd: 'STOP' });
        logger.success('Music stopped');
      } catch (err: any) {
        logger.error(`Could not stop daemon: ${err.message}`);
        process.exit(1);
      }
      return;
    }
    if (!audioService.isPlaying()) {
      logger.info('No music is currently playing');
      return;
    }
    audioService.stop();
    logger.success('Music stopped');
  });

export default stopCommand;