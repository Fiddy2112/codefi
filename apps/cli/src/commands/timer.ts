import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '@/services/logger';
import { COLORS } from '@/utils/constants';

const TIMER_FILE = path.join(os.homedir(), '.codefi', 'timer.json');

interface TimerSession {
  id:        string;
  startedAt: string; // ISO
  stoppedAt: string | null;
  duration:  number; // seconds, 0 while running
  note:      string;
}

interface TimerStore {
  active:   TimerSession | null;
  sessions: TimerSession[];
}

// ─── Storage ──────────────────────────────────────────────────────────────────
function load(): TimerStore {
  try {
    if (!fs.existsSync(TIMER_FILE)) return { active: null, sessions: [] };
    return JSON.parse(fs.readFileSync(TIMER_FILE, 'utf8')) as TimerStore;
  } catch { return { active: null, sessions: [] }; }
}

function save(store: TimerStore): void {
  const dir = path.dirname(TIMER_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TIMER_FILE, JSON.stringify(store, null, 2));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2,'0')}s`;
  return `${s}s`;
}

function sessionDuration(s: TimerSession): number {
  if (s.stoppedAt) return s.duration;
  return Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000);
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function isThisWeek(iso: string): boolean {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 7 && d <= now;
}

function renderBar(secs: number, target = 8 * 3600): string {
  const W      = 20;
  const filled = Math.min(W, Math.round((secs / target) * W));
  return chalk.hex(COLORS.PRIMARY)('█'.repeat(filled)) + chalk.gray('░'.repeat(W - filled));
}

// ─── Sub-commands ─────────────────────────────────────────────────────────────

const startCmd = new Command('start')
  .description('Start a coding session timer')
  .option('-n, --note <text>', 'Tag this session (e.g. "feature/auth")', '')
  .action((opts) => {
    const store = load();

    if (store.active) {
      const elapsed = fmtDuration(sessionDuration(store.active));
      logger.warning(`Timer already running (${elapsed}). Stop it first with: codefi timer stop`);
      return;
    }

    const session: TimerSession = {
      id:        `t-${Date.now()}`,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      duration:  0,
      note:      opts.note,
    };

    store.active = session;
    save(store);

    logger.newLine();
    console.log(chalk.hex(COLORS.PRIMARY)('  ⏱  Timer started'));
    if (opts.note) console.log(chalk.gray(`     Note: ${opts.note}`));
    logger.info('Stop with: codefi timer stop');
    logger.newLine();
  });

const stopCmd = new Command('stop')
  .description('Stop the current timer')
  .option('-n, --note <text>', 'Add or update session note')
  .action((opts) => {
    const store = load();

    if (!store.active) {
      logger.info('No timer is running. Start one with: codefi timer start');
      return;
    }

    const duration = sessionDuration(store.active);
    const finished: TimerSession = {
      ...store.active,
      stoppedAt: new Date().toISOString(),
      duration,
      note: opts.note || store.active.note,
    };

    store.sessions.push(finished);
    store.active = null;
    save(store);

    logger.newLine();
    console.log(chalk.hex(COLORS.PRIMARY)('  ⏹  Session stopped'));
    console.log(chalk.gray(`     Duration: `) + chalk.white.bold(fmtDuration(duration)));
    if (finished.note) console.log(chalk.gray(`     Note:     ${finished.note}`));
    logger.newLine();
  });

const statusCmd = new Command('status')
  .description('Show current timer status')
  .action(() => {
    const store = load();
    logger.newLine();

    if (!store.active) {
      logger.info('No timer running');
      logger.info('Start with: codefi timer start');
    } else {
      const elapsed = sessionDuration(store.active);
      const since   = new Date(store.active.startedAt).toLocaleTimeString();
      console.log(chalk.hex(COLORS.PRIMARY)('  ⏱  Timer running'));
      console.log(chalk.gray(`     Started:  ${since}`));
      console.log(chalk.gray(`     Elapsed:  `) + chalk.white.bold(fmtDuration(elapsed)));
      if (store.active.note) console.log(chalk.gray(`     Note:     ${store.active.note}`));
    }
    logger.newLine();
  });

const todayCmd = new Command('today')
  .description('Show today\'s coding time')
  .action(() => {
    const store    = load();
    const sessions = store.sessions.filter(s => isToday(s.startedAt));
    const active   = store.active && isToday(store.active.startedAt) ? store.active : null;

    const total = sessions.reduce((a, s) => a + s.duration, 0)
                + (active ? sessionDuration(active) : 0);

    logger.newLine();
    logger.box('TODAY');
    logger.newLine();

    console.log(chalk.gray('  Total time   ') + chalk.white.bold(fmtDuration(total)));
    console.log(chalk.gray('  Sessions     ') + chalk.white(String(sessions.length + (active ? 1 : 0))));
    console.log(chalk.gray('  Progress     ') + renderBar(total) + chalk.gray(' / 8h'));

    if (active) {
      console.log(chalk.gray('\n  ⏱ Currently: ') + chalk.hex(COLORS.PRIMARY)(fmtDuration(sessionDuration(active)) + ' (running)'));
    }

    if (sessions.length > 0) {
      logger.newLine();
      console.log(chalk.hex(COLORS.PRIMARY)('  Sessions'));
      sessions.slice(-5).forEach((s, i) => {
        const start = new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const end   = s.stoppedAt ? new Date(s.stoppedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'running';
        console.log(
          chalk.gray(`  ${String(i+1).padStart(2)}. ${start} – ${end}  `) +
          chalk.white(fmtDuration(s.duration).padEnd(10)) +
          (s.note ? chalk.gray(s.note) : '')
        );
      });
    }
    logger.newLine();
  });

const weekCmd = new Command('week')
  .description('Show this week\'s coding stats')
  .action(() => {
    const store    = load();
    const sessions = store.sessions.filter(s => isThisWeek(s.startedAt));
    const total    = sessions.reduce((a, s) => a + s.duration, 0);
    const avgDay   = total / 7;

    // Group by day
    const byDay: Record<string, number> = {};
    for (const s of sessions) {
      const day = new Date(s.startedAt).toLocaleDateString('en', { weekday: 'short' });
      byDay[day] = (byDay[day] ?? 0) + s.duration;
    }

    logger.newLine();
    logger.box('THIS WEEK');
    logger.newLine();

    console.log(chalk.gray('  Total time   ') + chalk.white.bold(fmtDuration(total)));
    console.log(chalk.gray('  Sessions     ') + chalk.white(String(sessions.length)));
    console.log(chalk.gray('  Daily avg    ') + chalk.white(fmtDuration(Math.floor(avgDay))));
    logger.newLine();

    // Bar chart per day
    console.log(chalk.hex(COLORS.PRIMARY)('  Daily breakdown'));
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const day of days) {
      const secs    = byDay[day] ?? 0;
      const bar     = renderBar(secs, 8 * 3600);
      const isToday = new Date().toLocaleDateString('en', { weekday: 'short' }) === day;
      const label   = isToday ? chalk.hex(COLORS.PRIMARY)(day) : chalk.gray(day);
      console.log(`  ${label}  ${bar}  ${chalk.gray(secs > 0 ? fmtDuration(secs) : '—')}`);
    }
    logger.newLine();
  });

const resetCmd = new Command('reset')
  .description('Reset all timer data')
  .action(async () => {
    const { default: inquirer } = await import('inquirer');
    const { ok } = await inquirer.prompt([{
      type: 'confirm', name: 'ok',
      message: 'Delete all timer history?', default: false,
    }]);
    if (!ok) { logger.info('Cancelled'); return; }
    save({ active: null, sessions: [] });
    logger.success('Timer data cleared');
  });

// ─── Root ─────────────────────────────────────────────────────────────────────
export const timerCommand = new Command('timer')
  .description('Track total coding time')
  .addCommand(startCmd)
  .addCommand(stopCmd)
  .addCommand(statusCmd)
  .addCommand(todayCmd)
  .addCommand(weekCmd)
  .addCommand(resetCmd)
  .action(() => { statusCmd.parseAsync([], { from: 'user' }); });

export default timerCommand;