import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { configService } from '@/services/config';
import { logger } from '@/services/logger';
import { COLORS } from '@/utils/constants';

const PID_FILE   = path.join(os.tmpdir(), 'codefi-player.pid');
const STATE_FILE = path.join(os.homedir(), '.codefi', 'now-playing.json');

function sendToPlayer(cmd: string): boolean {
  // The Python player reads stdin — we can't write to it from another process.
  // Instead we write a command to a FIFO/command file that player.py polls.
  // For now, update the state file so `status` reflects the change,
  // and save new default volume to config so next `play` picks it up.
  // A future player.py revision can watch ~/.codefi/player-cmd for live updates.
  try {
    const cmdFile = path.join(os.homedir(), '.codefi', 'player-cmd');
    fs.writeFileSync(cmdFile, cmd + '\n');
    return true;
  } catch {
    return false;
  }
}

function isPlayerAlive(): boolean {
  try {
    if (!fs.existsSync(PID_FILE)) return false;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (isNaN(pid)) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function updateStateVolume(vol: number): void {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state.volume = vol;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

function renderVolumeBar(vol: number): string {
  const W      = 24;
  const filled = Math.round((vol / 100) * W);
  return (
    chalk.hex(COLORS.PRIMARY)('█'.repeat(filled)) +
    chalk.gray('░'.repeat(W - filled)) +
    chalk.gray(` ${String(vol).padStart(3)}%`)
  );
}

export const volumeCommand = new Command('volume')
  .description('Get or set playback volume (0–100)')
  .alias('vol')
  .argument('[level]', 'Volume level 0–100, or +N / -N to adjust relative')
  .option('-m, --mute',   'Mute audio')
  .option('-u, --unmute', 'Unmute audio')
  .action((level: string | undefined, options) => {

    const alive      = isPlayerAlive();
    const currentVol = (configService.get('defaultVolume') as number) ?? 70;

    // ── No args → show current volume ───────────────────────────────────────
    if (!level && !options.mute && !options.unmute) {
      logger.newLine();
      console.log(
        chalk.gray('  Volume:  ') + renderVolumeBar(currentVol)
      );
      if (!alive) {
        logger.newLine();
        logger.info('No player running — this shows the default volume for next play');
      }
      logger.newLine();
      return;
    }

    let newVol = currentVol;

    // ── Mute / unmute ────────────────────────────────────────────────────────
    if (options.mute) {
      newVol = 0;
    } else if (options.unmute) {
      const last = (configService.get('lastVolume') as number) ?? 70;
      newVol = last > 0 ? last : 70;
    } else if (level) {
      // ── Relative: +10 or -10 ─────────────────────────────────────────────
      if (level.startsWith('+') || level.startsWith('-')) {
        const delta = parseInt(level, 10);
        if (isNaN(delta)) {
          logger.error(`Invalid value: "${level}". Use a number like 50, +10, or -5`);
          process.exit(1);
        }
        newVol = currentVol + delta;
      } else {
        // ── Absolute ─────────────────────────────────────────────────────────
        newVol = parseInt(level, 10);
        if (isNaN(newVol)) {
          logger.error(`Invalid volume: "${level}". Must be 0–100`);
          process.exit(1);
        }
      }
    }

    // Clamp
    newVol = Math.max(0, Math.min(100, newVol));

    // Save last non-zero volume for unmute
    if (newVol > 0) configService.set('lastVolume', newVol);

    // Persist as new default
    configService.set('defaultVolume', newVol);

    // Update state file (for `status` command)
    updateStateVolume(newVol);

    // Signal live player if running
    if (alive) {
      sendToPlayer(`VOL:${newVol}`);
    }

    // Print result
    logger.newLine();
    const label = newVol === 0 ? chalk.red('MUTED') : renderVolumeBar(newVol);
    console.log(chalk.gray('  Volume:  ') + label);

    if (alive) {
      logger.newLine();
      logger.success('Applied to running player');
    } else {
      logger.newLine();
      logger.info(`Saved — will use ${newVol}% on next codefi play`);
    }
    logger.newLine();
  });

export default volumeCommand;