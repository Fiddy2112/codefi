import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '@/services/logger';
import { COLORS } from '@/utils/constants';

const QUEUE_FILE = path.join(os.homedir(), '.codefi', 'queue.json');

export interface QueueEntry {
  id:      string;
  title:   string;
  artist:  string;
  source:  'youtube' | 'local' | 'url';
  ref:     string;   // filepath or URL
  addedAt: string;
}

// ─── Queue storage ────────────────────────────────────────────────────────────
export function loadQueue(): QueueEntry[] {
  try {
    if (!fs.existsSync(QUEUE_FILE)) return [];
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')) as QueueEntry[];
  } catch { return []; }
}

export function saveQueue(queue: QueueEntry[]): void {
  const dir = path.dirname(QUEUE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

export function shiftQueue(): QueueEntry | null {
  const q = loadQueue();
  if (q.length === 0) return null;
  const next = q.shift()!;
  saveQueue(q);
  return next;
}

export function clearQueue(): void {
  try { if (fs.existsSync(QUEUE_FILE)) fs.unlinkSync(QUEUE_FILE); } catch {}
}

// ─── Sub-commands ─────────────────────────────────────────────────────────────

const addCommand = new Command('add')
  .description('Add a track to the queue')
  .argument('<ref>', 'YouTube URL, local file path, or track title')
  .option('-t, --title  <title>',  'Track title (auto-detected for YouTube)')
  .option('-a, --artist <artist>', 'Artist name', 'Unknown Artist')
  .action(async (ref: string, options) => {
    const isYouTube = /youtu\.?be/.test(ref);
    const isUrl     = ref.startsWith('http');
    const isLocal   = fs.existsSync(ref);

    if (isUrl && !isYouTube) {
      // Custom URL
    } else if (!isYouTube && !isLocal) {
      logger.error(`Cannot resolve: "${ref}"`);
      logger.info('Pass a YouTube URL or a valid local file path');
      process.exit(1);
    }

    let title  = options.title;
    let artist = options.artist;

    // Auto-fetch YouTube title if not provided
    if (isYouTube && !title) {
      logger.info('Fetching track info from YouTube...');
      try {
        const { youtubeService } = await import('../services/youtube.js');
        const info = await youtubeService.getVideoInfo(ref);
        title  = info.title;
        artist = info.artist;
      } catch {
        title  = 'YouTube Track';
        artist = 'Unknown';
      }
    }

    if (!title && isLocal) {
      title = path.basename(ref, path.extname(ref));
    }

    const entry: QueueEntry = {
      id:      `q-${Date.now()}`,
      title:   title || ref,
      artist:  artist,
      source:  isYouTube ? 'youtube' : isUrl ? 'url' : 'local',
      ref,
      addedAt: new Date().toISOString(),
    };

    const queue = loadQueue();
    queue.push(entry);
    saveQueue(queue);

    logger.newLine();
    logger.success(`Added to queue: ${entry.title} — ${entry.artist}`);
    logger.info(`Queue length: ${queue.length} track${queue.length !== 1 ? 's' : ''}`);

    if (queue.length === 1) {
      logger.info('Will play after current track finishes');
    }
    logger.newLine();
  });

const listCommand = new Command('list')
  .description('Show the current queue')
  .action(() => {
    const queue = loadQueue();

    logger.newLine();

    if (queue.length === 0) {
      logger.info('Queue is empty');
      logger.info('Add tracks with: codefi queue add <youtube-url>');
      logger.newLine();
      return;
    }

    logger.box(`UP NEXT (${queue.length} track${queue.length !== 1 ? 's' : ''})`);
    logger.newLine();

    queue.forEach((entry, i) => {
      const sourceIcon: Record<string, string> = {
        youtube: '▶ ',
        local:   '💾',
        url:     '🌐',
      };
      const icon = sourceIcon[entry.source] ?? '🎵';
      console.log(
        chalk.gray(`  ${String(i + 1).padStart(3)}. `) +
        chalk.white.bold(entry.title) +
        chalk.gray(` — ${entry.artist}`) +
        '  ' + chalk.gray(icon)
      );
    });

    logger.newLine();
    logger.info('Clear with: codefi queue clear');
    logger.newLine();
  });

const removeCommand = new Command('remove')
  .description('Remove a track from the queue by position')
  .argument('<position>', 'Position in queue (1-based)')
  .action((pos: string) => {
    const idx = parseInt(pos, 10) - 1;
    const queue = loadQueue();

    if (isNaN(idx) || idx < 0 || idx >= queue.length) {
      logger.error(`Invalid position: ${pos}. Queue has ${queue.length} entries.`);
      process.exit(1);
    }

    const removed = queue.splice(idx, 1)[0];
    saveQueue(queue);
    logger.success(`Removed: ${removed.title}`);
  });

const clearCommand = new Command('clear')
  .description('Clear the entire queue')
  .action(() => {
    const queue = loadQueue();
    if (queue.length === 0) {
      logger.info('Queue is already empty');
      return;
    }
    clearQueue();
    logger.success(`Cleared ${queue.length} track${queue.length !== 1 ? 's' : ''} from queue`);
  });

// ─── Root queue command ───────────────────────────────────────────────────────
export const queueCommand = new Command('queue')
  .description('Manage the playback queue')
  .addCommand(addCommand)
  .addCommand(listCommand)
  .addCommand(removeCommand)
  .addCommand(clearCommand)
  .action(() => {
    listCommand.parseAsync([], { from: 'user' });
  });

export default queueCommand;