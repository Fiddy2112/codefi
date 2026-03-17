import { Command } from 'commander';
import chalk from 'chalk';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { logger }        from '@/services/logger';
import { COLORS, MOODS } from '@/utils/constants';
import { isDaemonRunning, getDaemonState } from '@/services/ipc';
import type { MoodType } from '@/types';

const STATE_FILE = path.join(os.homedir(), '.codefi', 'now-playing.json');

export interface NowPlayingState {
  title:     string;
  artist:    string;
  mood:      MoodType;
  volume:    number;
  source:    string;
  startedAt: string;
  isPaused:  boolean;
}

export function writeNowPlaying(s: NowPlayingState): void {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  } catch {}
}

export function clearNowPlaying(): void {
  try { if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE); } catch {}
}

function fmtElapsed(startedAt: string): string {
  const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export const statusCommand = new Command('status')
  .description('Show what is currently playing')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    let state: NowPlayingState | null = null;

    // Prefer live daemon state
    if (isDaemonRunning()) {
      const live = await getDaemonState();
      if (live) {
        state = {
          title:     live.title,
          artist:    live.artist,
          mood:      live.mood,
          volume:    live.volume,
          source:    live.source,
          startedAt: live.startedAt,
          isPaused:  live.paused,
        };
      }
    }

    // Fallback: file
    if (!state) {
      try {
        if (fs.existsSync(STATE_FILE)) {
          state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as NowPlayingState;
        }
      } catch {}
    }

    if (options.json) {
      console.log(JSON.stringify(state ? { playing: true, ...state } : { playing: false }));
      return;
    }

    logger.newLine();

    if (!state) {
      console.log(chalk.gray('  ⏹  Nothing is playing right now'));
      logger.newLine();
      logger.info('Start music with: codefi play');
      logger.newLine();
      return;
    }

    const mood   = MOODS[state.mood] ?? MOODS.focus;
    const W      = 20;
    const filled = Math.round((state.volume / 100) * W);
    const volBar =
      chalk.hex(COLORS.PRIMARY)('█'.repeat(filled)) +
      chalk.gray('░'.repeat(W - filled));

    const sourceLabel: Record<string, string> = {
      local: '💾 Local', cdn: '☁  CDN',
      youtube: '▶  YouTube', spotify: '🎵 Spotify', url: '🌐 URL',
    };

    console.log(chalk.hex(COLORS.PRIMARY)('  ┌─ Now Playing ──────────────────────────┐'));
    console.log(chalk.hex(COLORS.PRIMARY)('  │ ') + (state.isPaused ? chalk.yellow('⏸  PAUSED') : chalk.hex(COLORS.PRIMARY)('▶  PLAYING')));
    console.log(chalk.hex(COLORS.PRIMARY)('  │ ') + chalk.white.bold(state.title) + chalk.gray(` — ${state.artist}`));
    console.log(chalk.hex(COLORS.PRIMARY)('  │ ') + chalk.gray('Mood:    ') + chalk.white(`${mood.emoji}  ${mood.name}`));
    console.log(chalk.hex(COLORS.PRIMARY)('  │ ') + chalk.gray('Volume:  ') + volBar + chalk.gray(` ${state.volume}%`));
    console.log(chalk.hex(COLORS.PRIMARY)('  │ ') + chalk.gray('Source:  ') + chalk.white(sourceLabel[state.source] ?? state.source));
    console.log(chalk.hex(COLORS.PRIMARY)('  │ ') + chalk.gray('Playing: ') + chalk.white(fmtElapsed(state.startedAt)));
    console.log(chalk.hex(COLORS.PRIMARY)('  └────────────────────────────────────────┘'));
    logger.newLine();
    logger.info('codefi stop  |  codefi volume +10  |  codefi play --interactive');
    logger.newLine();
  });

export default statusCommand;