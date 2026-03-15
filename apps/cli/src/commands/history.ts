
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '@/services/logger';
import { COLORS, MOODS } from '@/utils/constants';
import type { MoodType } from '@/types';

const HISTORY_FILE = path.join(os.homedir(), '.codefi', 'history.json');
const MAX_ENTRIES  = 200;

export interface HistoryEntry {
  title:     string;
  artist:    string;
  mood:      MoodType;
  source:    string;
  playedAt:  string; // ISO
  duration:  number; // seconds actually listened
}

// ─── History helpers (exported so play.ts can call them) ──────────────────────
export function loadHistory(): HistoryEntry[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function appendHistory(entry: Omit<HistoryEntry, 'playedAt'>): void {
  try {
    const history = loadHistory();
    history.unshift({ ...entry, playedAt: new Date().toISOString() });

    // Keep only last MAX_ENTRIES
    if (history.length > MAX_ENTRIES) history.splice(MAX_ENTRIES);

    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch {}
}

export function clearHistory(): void {
  try { if (fs.existsSync(HISTORY_FILE)) fs.unlinkSync(HISTORY_FILE); } catch {}
}

// ─── Formatting helpers ───────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s    = Math.floor(diff / 1000);
  if (s < 60)        return 'just now';
  if (s < 3600)      return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)     return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fmtDuration(secs: number): string {
  if (secs < 60)  return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

const SOURCE_ICON: Record<string, string> = {
  local:   '💾',
  cdn:     '☁ ',
  youtube: '▶ ',
  spotify: '🎵',
  url:     '🌐',
};

// ─── stats helper ─────────────────────────────────────────────────────────────
function computeStats(history: HistoryEntry[]) {
  const totalSecs = history.reduce((a, e) => a + (e.duration ?? 0), 0);
  const moodCount: Partial<Record<MoodType, number>> = {};
  const artistCount: Record<string, number> = {};

  for (const e of history) {
    moodCount[e.mood] = (moodCount[e.mood] ?? 0) + 1;
    artistCount[e.artist] = (artistCount[e.artist] ?? 0) + 1;
  }

  const topMood   = Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0];
  const topArtist = Object.entries(artistCount).sort((a, b) => b[1] - a[1])[0];

  return { totalSecs, topMood, topArtist };
}

// ─── Sub-commands ─────────────────────────────────────────────────────────────
const listCommand = new Command('list')
  .description('Show recently played tracks')
  .option('-n, --limit <n>', 'Number of entries to show', '20')
  .option('--mood <mood>',   'Filter by mood')
  .option('--today',         'Show only today\'s history')
  .action((options) => {
    let history = loadHistory();

    if (options.mood) {
      history = history.filter((e) => e.mood === options.mood);
    }

    if (options.today) {
      const today = new Date().toDateString();
      history = history.filter((e) => new Date(e.playedAt).toDateString() === today);
    }

    const limit = parseInt(options.limit, 10) || 20;
    history = history.slice(0, limit);

    if (history.length === 0) {
      logger.newLine();
      logger.info('No history yet — play some music first!');
      logger.info('  codefi play');
      logger.newLine();
      return;
    }

    logger.newLine();
    logger.box(`RECENTLY PLAYED (${history.length})`);
    logger.newLine();

    history.forEach((e, i) => {
      const mood   = MOODS[e.mood] ?? MOODS.focus;
      const icon   = SOURCE_ICON[e.source] ?? '🎵';
      const num    = chalk.gray(`  ${String(i + 1).padStart(3)}. `);
      const title  = chalk.white.bold(e.title);
      const artist = chalk.gray(` — ${e.artist}`);
      const meta   = chalk.gray(
        `        ${mood.emoji} ${mood.name.padEnd(14)}` +
        `${icon} ${(e.source ?? 'local').padEnd(9)}` +
        `⏱  ${fmtDuration(e.duration ?? 0).padEnd(8)}` +
        relativeTime(e.playedAt)
      );

      console.log(num + title + artist);
      console.log(meta);
    });

    logger.newLine();
  });

const statsCommand = new Command('stats')
  .description('Show listening stats')
  .action(() => {
    const history = loadHistory();

    if (history.length === 0) {
      logger.info('No history yet');
      return;
    }

    const { totalSecs, topMood, topArtist } = computeStats(history);
    const totalMins = Math.floor(totalSecs / 60);
    const hours     = Math.floor(totalMins / 60);
    const mins      = totalMins % 60;

    logger.newLine();
    logger.box('LISTENING STATS');
    logger.newLine();

    const row = (label: string, value: string) =>
      console.log(chalk.gray(`  ${label.padEnd(22)}`) + chalk.white(value));

    row('Total sessions',    String(history.length));
    row('Total listen time', hours > 0 ? `${hours}h ${mins}m` : `${mins}m`);

    if (topMood) {
      const m = MOODS[topMood[0] as MoodType];
      row('Favourite mood',   `${m?.emoji ?? ''} ${m?.name ?? topMood[0]} (${topMood[1]}x)`);
    }

    if (topArtist) {
      row('Top artist',       `${topArtist[0]} (${topArtist[1]} plays)`);
    }

    // Mood breakdown bar chart
    logger.newLine();
    console.log(chalk.hex(COLORS.PRIMARY)('  Mood breakdown'));
    const moodCount: Partial<Record<MoodType, number>> = {};
    for (const e of history) moodCount[e.mood] = (moodCount[e.mood] ?? 0) + 1;
    const maxCount = Math.max(...Object.values(moodCount) as number[]);

    for (const [mood, count] of Object.entries(moodCount).sort((a, b) => (b[1] as number) - (a[1] as number))) {
      const m      = MOODS[mood as MoodType];
      const barLen = Math.round(((count as number) / maxCount) * 20);
      const bar    = chalk.hex(COLORS.PRIMARY)('█'.repeat(barLen)) +
                     chalk.gray('░'.repeat(20 - barLen));
      console.log(
        chalk.gray(`  ${(m?.emoji + ' ' + m?.name).padEnd(18)} `) +
        bar +
        chalk.gray(` ${count}`)
      );
    }

    logger.newLine();
  });

const clearCommand = new Command('clear')
  .description('Clear listening history')
  .action(async () => {
    const { confirmed } = await (await import('inquirer')).default.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: 'Clear all listening history?',
      default: false,
    }]);

    if (!confirmed) { logger.info('Cancelled'); return; }
    clearHistory();
    logger.success('History cleared');
  });

// ─── Root history command ─────────────────────────────────────────────────────
export const historyCommand = new Command('history')
  .description('View recently played tracks and listening stats')
  .addCommand(listCommand)
  .addCommand(statsCommand)
  .addCommand(clearCommand)
  // `codefi history` → list
  .action(() => {
    listCommand.parseAsync([], { from: 'user' });
  });

export default historyCommand;