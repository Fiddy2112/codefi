import { Command } from 'commander';
import { spawn } from 'child_process';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '@/services/logger';
import { COLORS, MOODS } from '@/utils/constants';
import type { MoodType } from '@/types';
import type { NowPlayingState } from './status';

const STATE_FILE = path.join(os.homedir(), '.codefi', 'now-playing.json');

// ─── Clipboard helper (cross-platform, no deps) ───────────────────────────────
function copyToClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const platform = process.platform;
    let cmd: string;
    let args: string[];

    if (platform === 'darwin') {
      cmd = 'pbcopy'; args = [];
    } else if (platform === 'win32') {
      cmd = 'clip'; args = [];
    } else {
      // Linux: try xclip → xsel → wl-copy
      cmd = 'xclip'; args = ['-selection', 'clipboard'];
    }

    try {
      const child = spawn(cmd, args, { shell: false, stdio: ['pipe', 'ignore', 'ignore'] });
      child.stdin?.write(text);
      child.stdin?.end();
      child.on('error', () => {
        // Fallback for Linux Wayland
        if (platform === 'linux') {
          const wl = spawn('wl-copy', [], { shell: false, stdio: ['pipe', 'ignore', 'ignore'] });
          wl.stdin?.write(text);
          wl.stdin?.end();
          wl.on('error', () => resolve(false));
          wl.on('close', (code) => resolve(code === 0));
        } else {
          resolve(false);
        }
      });
      child.on('close', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

// ─── Format templates ─────────────────────────────────────────────────────────
function buildShareText(state: NowPlayingState, format: string): string {
  const mood = MOODS[state.mood] ?? MOODS.focus;

  const templates: Record<string, string> = {
    short:
      `🎧 ${state.title} — ${state.artist}`,

    default:
      `🎧 Listening to "${state.title}" by ${state.artist}\n` +
      `${mood.emoji} Mood: ${mood.name} | Coded with CodeFi\n` +
      `codefi.dev`,

    tweet:
      `🎧 Coding to "${state.title}" by ${state.artist} ${mood.emoji}\n` +
      `#CodeFi #CodingMusic #${mood.name.replace(/\s/g, '')}`,

    markdown:
      `> 🎧 **${state.title}** — ${state.artist}  \n` +
      `> ${mood.emoji} *${mood.name} mode* · Powered by [CodeFi](https://codefi.dev)`,

    discord:
      `🎧 **Now coding to:** ${state.title} — ${state.artist}\n` +
      `${mood.emoji} **Mood:** ${mood.name}`,
  };

  return templates[format] ?? templates['default'];
}

// ─── Command ──────────────────────────────────────────────────────────────────
export const shareCommand = new Command('share')
  .description('Share what you\'re listening to')
  .option('-f, --format <fmt>', 'Format: default, short, tweet, markdown, discord', 'default')
  .option('--no-copy',          'Print only, do not copy to clipboard')
  .action(async (options) => {
    logger.newLine();

    // Read current state
    let state: NowPlayingState | null = null;
    try {
      if (fs.existsSync(STATE_FILE)) {
        state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as NowPlayingState;
      }
    } catch {}

    if (!state) {
      logger.info('Nothing is playing right now');
      logger.info('Start music with: codefi play');
      logger.newLine();
      return;
    }

    const text = buildShareText(state, options.format);

    // Print preview
    console.log(chalk.hex(COLORS.PRIMARY)('  ┌─ Share ─────────────────────────────────┐'));
    text.split('\n').forEach((line) => {
      const padded = line.padEnd(42).slice(0, 42);
      console.log(chalk.hex(COLORS.PRIMARY)('  │ ') + chalk.white(padded) + chalk.hex(COLORS.PRIMARY)(' │'));
    });
    console.log(chalk.hex(COLORS.PRIMARY)('  └────────────────────────────────────────┘'));
    logger.newLine();

    // Copy to clipboard
    if (options.copy !== false) {
      const copied = await copyToClipboard(text);
      if (copied) {
        logger.success('Copied to clipboard!');
      } else {
        logger.warning('Could not copy to clipboard automatically');
        logger.info('Install xclip (Linux) or use --no-copy and copy manually');
      }
    }

    // Format hint
    logger.newLine();
    logger.info('Other formats: --format short | tweet | markdown | discord');
    logger.newLine();
  });

export default shareCommand;