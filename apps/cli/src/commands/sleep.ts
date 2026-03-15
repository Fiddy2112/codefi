import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '@/services/logger';
import { COLORS } from '@/utils/constants';

const SLEEP_FILE = path.join(os.homedir(), '.codefi', 'sleep-timer.json');
const PID_FILE   = path.join(os.tmpdir(), 'codefi-player.pid');

interface SleepTimer {
  stopAt:  string;  // ISO timestamp
  minutes: number;
}

function writeSleepTimer(minutes: number): void {
  const dir = path.dirname(SLEEP_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SLEEP_FILE, JSON.stringify({
    stopAt:  new Date(Date.now() + minutes * 60_000).toISOString(),
    minutes,
  } as SleepTimer));
}

function clearSleepTimer(): void {
  try { if (fs.existsSync(SLEEP_FILE)) fs.unlinkSync(SLEEP_FILE); } catch {}
}

function readSleepTimer(): SleepTimer | null {
  try {
    if (!fs.existsSync(SLEEP_FILE)) return null;
    return JSON.parse(fs.readFileSync(SLEEP_FILE, 'utf8')) as SleepTimer;
  } catch { return null; }
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function isPlayerAlive(): boolean {
  try {
    if (!fs.existsSync(PID_FILE)) return false;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (isNaN(pid)) return false;
    process.kill(pid, 0);
    return true;
  } catch { return false; }
}

function stopPlayer(): void {
  try {
    if (!fs.existsSync(PID_FILE)) return;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (!isNaN(pid)) process.kill(pid, 'SIGTERM');
    fs.unlinkSync(PID_FILE);
  } catch {}
}

// ─── Command ──────────────────────────────────────────────────────────────────
export const sleepCommand = new Command('sleep')
  .description('Stop music after a specified number of minutes')
  .argument('[minutes]', 'Minutes until music stops (omit to check status)')
  .option('-c, --cancel', 'Cancel the active sleep timer')
  .option('--now',        'Stop music immediately')
  .action(async (minutesArg: string | undefined, options) => {
    logger.newLine();

    // ── Stop now ────────────────────────────────────────────────────────────
    if (options.now) {
      clearSleepTimer();
      stopPlayer();
      logger.success('Music stopped');
      logger.newLine();
      return;
    }

    // ── Cancel ──────────────────────────────────────────────────────────────
    if (options.cancel) {
      const existing = readSleepTimer();
      if (!existing) {
        logger.info('No sleep timer is active');
      } else {
        clearSleepTimer();
        logger.success('Sleep timer cancelled');
      }
      logger.newLine();
      return;
    }

    // ── Status (no arg) ─────────────────────────────────────────────────────
    if (!minutesArg) {
      const existing = readSleepTimer();
      if (!existing) {
        logger.info('No sleep timer set');
        logger.info('Usage: codefi sleep <minutes>');
      } else {
        const remaining = new Date(existing.stopAt).getTime() - Date.now();
        if (remaining <= 0) {
          clearSleepTimer();
          logger.info('Sleep timer expired');
        } else {
          console.log(
            chalk.hex(COLORS.PRIMARY)('  ⏰ Sleep timer: ') +
            chalk.white.bold(formatRemaining(remaining)) +
            chalk.gray(' remaining')
          );
          console.log(chalk.gray(`     Will stop at: ${new Date(existing.stopAt).toLocaleTimeString()}`));
          logger.newLine();
          logger.info('Cancel with: codefi sleep --cancel');
        }
      }
      logger.newLine();
      return;
    }

    // ── Set timer ───────────────────────────────────────────────────────────
    const minutes = parseInt(minutesArg, 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 480) {
      logger.error('Minutes must be between 1 and 480');
      process.exit(1);
    }

    // Cancel any existing timer
    const existing = readSleepTimer();
    if (existing) {
      logger.info('Replacing existing sleep timer');
    }

    writeSleepTimer(minutes);

    const stopAt = new Date(Date.now() + minutes * 60_000);
    console.log(
      chalk.hex(COLORS.PRIMARY)('  ⏰ Sleep timer set: ') +
      chalk.white.bold(`${minutes} minutes`) +
      chalk.gray(` — stops at ${stopAt.toLocaleTimeString()}`)
    );
    logger.newLine();
    logger.info('Cancel with: codefi sleep --cancel');
    logger.newLine();

    // ── Run the countdown in this process ────────────────────────────────────
    // We stay alive and poll — player.ts can also check SLEEP_FILE on each tick
    const stopTime = stopAt.getTime();
    let lastDisplay = '';

    const interval = setInterval(() => {
      const remaining = stopTime - Date.now();

      if (remaining <= 0) {
        clearInterval(interval);
        clearSleepTimer();

        if (isPlayerAlive()) {
          stopPlayer();
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          logger.success('Sleep timer: music stopped. Good night! 🌙');
        } else {
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          logger.info('Sleep timer expired (player already stopped)');
        }

        process.exit(0);
      }

      const display = formatRemaining(remaining);
      if (display !== lastDisplay) {
        process.stdout.write(`\r  ⏰ ${chalk.hex(COLORS.PRIMARY)(display)} remaining — Ctrl+C to cancel`);
        lastDisplay = display;
      }
    }, 500);

    process.on('SIGINT', () => {
      clearInterval(interval);
      clearSleepTimer();
      process.stdout.write('\n');
      logger.info('Sleep timer cancelled');
      process.exit(0);
    });
  });

export default sleepCommand;