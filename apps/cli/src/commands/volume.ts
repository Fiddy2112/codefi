import { Command } from 'commander';
import chalk from 'chalk';
import { logger }        from '@/services/logger';
import { configService } from '@/services/config';
import { COLORS }        from '@/utils/constants';
import { isDaemonRunning, sendCommand } from '@/services/ipc';
import { audioService } from '@/services/audio';

function renderVolBar(vol: number): string {
  const W      = 24;
  const filled = Math.round((vol / 100) * W);
  return (
    chalk.hex(COLORS.PRIMARY)('█'.repeat(filled)) +
    chalk.gray('░'.repeat(W - filled)) +
    chalk.gray(` ${String(vol).padStart(3)}%`)
  );
}

export const volumeCommand = new Command('volume')
  .alias('vol')
  .description('Get or set playback volume (0–100)')
  .argument('[level]', 'Level 0–100, or +N / -N for relative adjust')
  .option('-m, --mute',   'Mute audio')
  .option('-u, --unmute', 'Unmute audio')
  .action(async (level: string | undefined, options) => {
    const currentVol = (configService.get('defaultVolume') as number) ?? 70;

    // ── No args → show current volume ───────────────────────────────────────
    if (!level && !options.mute && !options.unmute) {
      logger.newLine();
      let liveVol = currentVol;
      if (isDaemonRunning()) {
        try {
          const reply = await sendCommand({ cmd: 'STATUS' });
          if (reply.ok && reply.state) liveVol = reply.state.volume;
        } catch {}
      }
      console.log(chalk.gray('  Volume:  ') + renderVolBar(liveVol));
      logger.newLine();
      return;
    }

    // ── Compute new volume ───────────────────────────────────────────────────
    let newVol = currentVol;

    if (options.mute) {
      newVol = 0;
    } else if (options.unmute) {
      newVol = (configService.get('lastVolume') as number) || 70;
    } else if (level) {
      if (level.startsWith('+') || level.startsWith('-')) {
        newVol = currentVol + parseInt(level, 10);
      } else {
        newVol = parseInt(level, 10);
        if (isNaN(newVol)) {
          logger.error(`Invalid volume: "${level}". Must be 0–100`);
          process.exit(1);
        }
      }
    }

    newVol = Math.max(0, Math.min(100, newVol));
    if (newVol > 0) configService.set('lastVolume', newVol);
    configService.set('defaultVolume', newVol);

    // ── Send to daemon or direct fallback ────────────────────────────────────
    if (isDaemonRunning()) {
      try {
        await sendCommand(newVol === 0
          ? { cmd: 'MUTE' }
          : { cmd: 'VOLUME', value: newVol }
        );
      } catch (err: any) {
        logger.error(`Could not update daemon volume: ${err.message}`);
      }
    } else {
      if (audioService.isPlaying()) audioService.setVolume(newVol);
    }

    // ── Show result ──────────────────────────────────────────────────────────
    logger.newLine();
    const label = newVol === 0 ? chalk.red('MUTED') : renderVolBar(newVol);
    console.log(chalk.gray('  Volume:  ') + label);
    if (!isDaemonRunning()) {
      logger.newLine();
      logger.info('Saved as default — applies on next codefi play');
    }
    logger.newLine();
  });

export default volumeCommand;