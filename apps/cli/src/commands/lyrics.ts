import { Command } from 'commander';
import https from 'https';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '@/services/logger';
import { COLORS } from '@/utils/constants';
import type { NowPlayingState } from './status';

const STATE_FILE   = path.join(os.homedir(), '.codefi', 'now-playing.json');
const LYRICS_CACHE = path.join(os.homedir(), '.codefi', 'cache', 'lyrics');

// ─── Genius API ───────────────────────────────────────────────────────────────
function geniusGet(urlPath: string, token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.genius.com${urlPath}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Failed to parse Genius response')); }
        });
      }
    );
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Genius API timed out')); });
  });
}

// Strip HTML tags from Genius lyrics (they sometimes return HTML)
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

async function searchLyrics(title: string, artist: string, token: string): Promise<string | null> {
  const q    = encodeURIComponent(`${title} ${artist}`);
  const res  = await geniusGet(`/search?q=${q}`, token);
  const hits = res?.response?.hits ?? [];

  if (hits.length === 0) return null;

  // Pick best match
  const hit = hits[0]?.result;
  if (!hit) return null;

  // Genius doesn't expose full lyrics via API — we get the embed URL
  // and use the plain-text endpoint
  const songId = hit.id as number;
  const songRes = await geniusGet(`/songs/${songId}?text_format=plain`, token);
  const plain   = songRes?.response?.song?.lyrics?.plain as string | undefined;

  if (plain) return plain;

  // Fallback: return description + note
  return `[Lyrics for "${title}" by ${artist}]\n\nFull lyrics available at:\n${hit.url}`;
}

// ─── Cache ────────────────────────────────────────────────────────────────────
function cacheKey(title: string, artist: string): string {
  return `${title}-${artist}`.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 80);
}

function cachedLyrics(title: string, artist: string): string | null {
  if (!fs.existsSync(LYRICS_CACHE)) return null;
  const f = path.join(LYRICS_CACHE, `${cacheKey(title, artist)}.txt`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
}

function cacheLyrics(title: string, artist: string, lyrics: string): void {
  if (!fs.existsSync(LYRICS_CACHE)) fs.mkdirSync(LYRICS_CACHE, { recursive: true });
  fs.writeFileSync(path.join(LYRICS_CACHE, `${cacheKey(title, artist)}.txt`), lyrics);
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderLyrics(lyrics: string, title: string, artist: string): void {
  const lines = lyrics.split('\n');
  const W     = Math.min(process.stdout.columns ?? 70, 70);

  logger.newLine();
  console.log(chalk.hex(COLORS.PRIMARY)('  ♪ ' + title) + chalk.gray(` — ${artist}`));
  console.log(chalk.hex(COLORS.PRIMARY)('  ' + '─'.repeat(W - 2)));
  logger.newLine();

  for (const line of lines) {
    if (line.trim() === '') {
      console.log('');
    } else if (line.startsWith('[') && line.endsWith(']')) {
      // Section headers like [Verse 1], [Chorus]
      console.log(chalk.hex(COLORS.PRIMARY)('  ' + line));
    } else {
      console.log(chalk.white('  ' + line));
    }
  }

  logger.newLine();
  console.log(chalk.gray('  Lyrics via Genius.com'));
  logger.newLine();
}

// ─── Command ──────────────────────────────────────────────────────────────────
export const lyricsCommand = new Command('lyrics')
  .description('Show lyrics for the currently playing track')
  .argument('[title]', 'Song title (uses now-playing if omitted)')
  .option('-a, --artist <artist>', 'Artist name')
  .option('--no-cache',            'Bypass lyrics cache')
  .action(async (titleArg: string | undefined, options) => {
    const token = process.env.GENIUS_ACCESS_TOKEN;

    if (!token) {
      logger.newLine();
      logger.error('GENIUS_ACCESS_TOKEN not set');
      logger.newLine();
      console.log(chalk.gray('  Get a free token at:'));
      console.log(chalk.hex(COLORS.PRIMARY)('  https://genius.com/api-clients'));
      console.log(chalk.gray('\n  Then add to your .env:'));
      console.log(chalk.white('  GENIUS_ACCESS_TOKEN=your_token_here'));
      logger.newLine();
      process.exit(1);
    }

    let title  = titleArg;
    let artist = options.artist ?? '';

    // Read from now-playing state if no args given
    if (!title) {
      try {
        if (fs.existsSync(STATE_FILE)) {
          const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as NowPlayingState;
          title  = state.title;
          artist = state.artist;
        }
      } catch {}
    }

    if (!title) {
      logger.info('Nothing is playing. Pass a title: codefi lyrics "Song Name" --artist "Artist"');
      process.exit(1);
    }

    logger.newLine();
    logger.info(`Searching lyrics: ${title}${artist ? ` — ${artist}` : ''}`);

    // Check cache first
    if (options.cache !== false) {
      const cached = cachedLyrics(title, artist);
      if (cached) {
        renderLyrics(cached, title, artist);
        return;
      }
    }

    try {
      const lyrics = await searchLyrics(title, artist, token);

      if (!lyrics) {
        logger.warning(`No lyrics found for "${title}"${artist ? ` by ${artist}` : ''}`);
        logger.info('Try with the exact song title: codefi lyrics "Exact Title" --artist "Artist"');
        process.exit(1);
      }

      if (options.cache !== false) {
        cacheLyrics(title, artist, lyrics);
      }

      renderLyrics(lyrics, title, artist);
    } catch (err: any) {
      logger.error(`Failed to fetch lyrics: ${err.message}`);
      process.exit(1);
    }
  });

export default lyricsCommand;