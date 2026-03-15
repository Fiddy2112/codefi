import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { configService } from '@/services/config';
import { logger } from '@/services/logger';
import { COLORS, MOODS } from '@/utils/constants';
import type { MoodType } from '@/types';

const PID_FILE    = path.join(os.tmpdir(), 'codefi-player.pid');
const STATE_FILE  = path.join(os.homedir(), '.codefi', 'now-playing.json');

// play.ts should write this file whenever a track starts
export interface NowPlayingState {
  title:     string;
  artist:    string;
  mood:      MoodType;
  volume:    number;
  source:    string;        // 'local' | 'youtube' | 'spotify' | 'url'
  startedAt: string;        // ISO timestamp
  isPaused:  boolean;
}

/** Write current playback state — called from play.ts when a track starts */
export function writeNowPlaying(state: NowPlayingState): void {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

/** Clear playback state — called from stop.ts / play.ts on quit */
export function clearNowPlaying(): void {
  try { if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE); } catch {}
}

/** Check if the player process in PID_FILE is still alive */
function isPlayerAlive(): boolean {
  try {
    if (!fs.existsSync(PID_FILE)) return false;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (isNaN(pid)) return false;
    process.kill(pid, 0); // signal 0 = existence check, throws if dead
    return true;
  } catch {
    return false;
  }
}

function formatDuration(startedAt: string): string {
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export const statusCommand = new Command('status')
  .description('Show what is currently playing')
  .option('-j, --json', 'Output as JSON (for scripting)')
  .action((options) => {
    const alive = isPlayerAlive();

    // ── JSON output for scripts / other tools ───────────────────────────────
    if (options.json) {
      if (!alive) {
        console.log(JSON.stringify({ playing: false }));
        return;
      }
      try {
        const raw   = fs.readFileSync(STATE_FILE, 'utf8');
        const state = JSON.parse(raw) as NowPlayingState;
        console.log(JSON.stringify({ playing: true, ...state }));
      } catch {
        console.log(JSON.stringify({ playing: true, error: 'state file missing' }));
      }
      return;
    }

    // ── Human-readable output ────────────────────────────────────────────────
    logger.newLine();

    if (!alive) {
      // Clean up stale state file if process is gone
      clearNowPlaying();

      console.log(
        chalk.gray('  ') +
        chalk.hex(COLORS.GRAY)('⏹  Nothing is playing right now')
      );
      logger.newLine();
      logger.info('Start music with: codefi play');
      logger.newLine();
      return;
    }

    // Player is alive — read state
    let state: NowPlayingState | null = null;
    try {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      state     = JSON.parse(raw) as NowPlayingState;
    } catch {}

    if (!state) {
      // Process alive but no state file (race condition on startup)
      console.log(chalk.hex(COLORS.PRIMARY)('  🎧 Music is playing'));
      logger.newLine();
      return;
    }

    const moodCfg = MOODS[state.mood] ?? MOODS.focus;
    const elapsed = formatDuration(state.startedAt);
    const statusIcon = state.isPaused ? '⏸ ' : '▶ ';
    const statusLabel = state.isPaused
      ? chalk.yellow('PAUSED')
      : chalk.hex(COLORS.PRIMARY)('PLAYING');

    // Box header
    console.log(chalk.hex(COLORS.PRIMARY)('  ┌─ Now Playing ──────────────────────────┐'));

    // Status
    const statusLine = `${statusIcon} ${statusLabel}`;
    console.log(chalk.hex(COLORS.PRIMARY)('  │ ') + statusLine);

    // Track info
    console.log(
      chalk.hex(COLORS.PRIMARY)('  │ ') +
      chalk.white.bold(state.title) +
      chalk.gray(` — ${state.artist}`)
    );

    // Mood
    console.log(
      chalk.hex(COLORS.PRIMARY)('  │ ') +
      chalk.gray(`Mood:    `) +
      chalk.white(`${moodCfg.emoji}  ${moodCfg.name}`)
    );

    // Volume bar
    const volBarW  = 16;
    const filled   = Math.round((state.volume / 100) * volBarW);
    const volBar   = chalk.hex(COLORS.PRIMARY)('█'.repeat(filled)) +
                     chalk.gray('░'.repeat(volBarW - filled));
    console.log(
      chalk.hex(COLORS.PRIMARY)('  │ ') +
      chalk.gray(`Volume:  `) +
      volBar +
      chalk.gray(` ${state.volume}%`)
    );

    // Source
    const sourceLabel: Record<string, string> = {
      local:   '💾 Local',
      youtube: '▶  YouTube',
      spotify: '🎵 Spotify',
      url:     '🌐 URL',
      cdn:     '☁  CDN',
    };
    console.log(
      chalk.hex(COLORS.PRIMARY)('  │ ') +
      chalk.gray(`Source:  `) +
      chalk.white(sourceLabel[state.source] ?? state.source)
    );

    // Elapsed
    console.log(
      chalk.hex(COLORS.PRIMARY)('  │ ') +
      chalk.gray(`Playing: `) +
      chalk.white(elapsed)
    );

    // Account
    const plan = configService.isPro()
      ? chalk.hex(COLORS.PRIMARY)('Pro ✓')
      : chalk.gray('Free');
    console.log(
      chalk.hex(COLORS.PRIMARY)('  │ ') +
      chalk.gray(`Plan:    `) +
      plan
    );

    console.log(chalk.hex(COLORS.PRIMARY)('  └────────────────────────────────────────┘'));

    // Controls reminder
    logger.newLine();
    logger.info('[S] Pause  [N/P] Track  [↑↓] Volume  [Q] Quit — inside the player');
    logger.newLine();
  });

export default statusCommand;