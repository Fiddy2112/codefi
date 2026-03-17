import { Command } from 'commander';
import { spawn }   from 'child_process';
import chalk  from 'chalk';
import fs     from 'fs';
import path   from 'path';
import os     from 'os';
import { configService }  from '@/services/config';
import { logger }         from '@/services/logger';
import { COLORS, MOODS }  from '@/utils/constants';
import { isDaemonRunning, sendCommand, pingDaemon } from '@/services/ipc';
import { DAEMON_LOG }     from '@/services/daemon';
import type { MoodType }  from '@/types';
import { aiService } from '@/services/ai';

// Resolve path to compiled daemon entry point
function getDaemonScript(): string {
  const candidates = [
    path.resolve(__dirname, 'daemon.js'),          // dist/commands/daemon.js
    path.resolve(__dirname, '../daemon.js'),        // fallback
    path.resolve(process.cwd(), 'dist/commands/daemon.js'),
    path.resolve(process.cwd(), 'dist/services/daemon.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Dev mode: run via ts-node
  return path.resolve(__dirname, 'daemon.ts');
}

// Spawn daemon as detached background process
async function spawnDaemon(opts: {
  mood:        MoodType;
  volume:      number;
  interactive: boolean;
}): Promise<void> {
  const script = getDaemonScript();
  const isTs   = script.endsWith('.ts');

  const args = [
    ...(isTs ? ['-r', 'tsconfig-paths/register'] : []),
    script,
    '--mood',   opts.mood,
    '--volume', String(opts.volume),
    ...(opts.interactive ? ['--interactive'] : []),
  ];

  const cmd = isTs ? 'ts-node' : 'node';

  const child = spawn(cmd, args, {
    detached: !opts.interactive,
    stdio:    opts.interactive ? 'inherit' : 'ignore',
    env: { ...process.env },
  });

  if (!opts.interactive) {
    child.unref(); // let parent exit without waiting
  }

  // Wait briefly and ping to confirm daemon started
  if (!opts.interactive) {
    await new Promise(r => setTimeout(r, 800));
    const alive = await pingDaemon();
    if (!alive) {
      throw new Error(
        `Daemon failed to start.\nCheck log: ${DAEMON_LOG}\n` +
        `Try running: codefi doctor`
      );
    }
  }
}

export const playCommand = new Command('play')
  .description('Start playing music')
  .option('-m, --mood <mood>',     'Mood: focus, chill, debug, flow, creative')
  .option('-v, --volume <number>', 'Volume 0–100')
  .option('--spotify <query>',     'Play from Spotify (Pro)')
  .option('--youtube <url>',       'Play from YouTube (Pro)')
  .option('--url <url>',           'Play from custom URL (Pro)')
  .option('--ai-mood',             'Auto-detect mood with AI (Pro)')
  .option('--interactive',         'Show visualizer in this terminal (blocks terminal)')
  .action(async (options) => {
    // ── AI mood detection ──────────────────────────────────────────────────
    let mood = (options.mood ?? configService.get('defaultMood') ?? 'focus') as MoodType;

    if (options.aiMood) {
      if (!configService.isPro()) { logger.proRequired(); process.exit(1); }
      const r = await aiService.detectMood();
      mood = r.mood;
      logger.success(`🤖 AI detected mood: ${r.mood} (${(r.confidence * 100).toFixed(0)}%)`);
      logger.info(`💡 ${r.reason}`);
      logger.newLine();
    }

    const volume = options.volume
      ? Math.max(0, Math.min(100, parseInt(options.volume, 10)))
      : (configService.get('defaultVolume') as number ?? 70);

    // ── If daemon already running → send PLAY command ──────────────────────
    if (isDaemonRunning()) {
      logger.info('Player already running — switching track...');
      try {
        const reply = await sendCommand({ cmd: 'PLAY', mood, volume });
        if (!reply.ok) throw new Error(reply.error ?? 'Unknown error');
        const s     = reply.state!;
        const moodCfg = MOODS[s.mood];
        logger.newLine();
        logger.success(`Now playing: ${s.title} — ${s.artist}`);
        logger.info(`Mood: ${moodCfg?.emoji ?? ''} ${moodCfg?.name ?? s.mood}  |  Volume: ${s.volume}%`);
        logger.newLine();
      } catch (err: any) {
        logger.error(`Could not send to daemon: ${err.message}`);
        process.exit(1);
      }
      return;
    }

    // ── Spotify / YouTube / URL — delegate to daemon or direct ────────────
    if (options.spotify || options.youtube || options.url) {
      if (!configService.isPro()) { logger.proRequired(); process.exit(1); }
      // These require inline handling for now — run interactive so user sees progress
      options.interactive = true;
    }

    // ── Spawn daemon ───────────────────────────────────────────────────────
    const interactive = !!options.interactive;
    const moodCfg     = MOODS[mood];

    if (!interactive) {
      logger.newLine();
      logger.info(`Starting player in background...`);
    }

    try {
      await spawnDaemon({ mood, volume, interactive });
    } catch (err: any) {
      logger.error(err.message);
      process.exit(1);
    }

    if (!interactive) {
      logger.newLine();
      console.log(
        chalk.hex(COLORS.PRIMARY)('  🎧 Playing: ') +
        chalk.white.bold(`${moodCfg?.emoji ?? ''} ${moodCfg?.name ?? mood} mix`) +
        chalk.gray(`  vol ${volume}%`)
      );
      logger.newLine();
      logger.info('Controls:');
      logger.info('  codefi stop             # Stop music');
      logger.info('  codefi status           # What\'s playing');
      logger.info('  codefi volume +10       # Adjust volume');
      logger.info('  codefi play --interactive  # Show full player UI');
      logger.newLine();
    }
  });

export default playCommand;