import { Command } from 'commander';
import { spawn }   from 'child_process';
import chalk from 'chalk';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { logger }        from '@/services/logger';
import { configService } from '@/services/config';
import { COLORS, getFreeTierTrack, DEFAULT_PLAYLISTS } from '@/utils/constants';
import { audioService } from '@/services/audio';
import { trackDownloader } from '@/services/trackDownloader';

const FOCUS_FILE  = path.join(os.homedir(), '.codefi', 'focus-session.json');
const HOSTS_FILE  = process.platform === 'win32'
  ? 'C:\\Windows\\System32\\drivers\\etc\\hosts'
  : '/etc/hosts';

// Sites to block during focus mode — bro có thể customize
const DEFAULT_BLOCK_LIST = [
  'facebook.com', 'www.facebook.com',
  'twitter.com',  'www.twitter.com',   'x.com',
  'instagram.com','www.instagram.com',
  'reddit.com',   'www.reddit.com',
  'youtube.com',  'www.youtube.com',
  'tiktok.com',   'www.tiktok.com',
  'netflix.com',  'www.netflix.com',
];

const HOSTS_MARKER_START = '# codefi-focus-start';
const HOSTS_MARKER_END   = '# codefi-focus-end';

interface FocusSession {
  startedAt: string;
  minutes:   number;
  blocklist: string[];
  mood:      string;
}

// ─── Hosts file helpers ───────────────────────────────────────────────────────
function requiresRoot(): boolean {
  // On Unix, writing /etc/hosts needs sudo
  if (process.platform === 'win32') return false;
  try { fs.accessSync(HOSTS_FILE, fs.constants.W_OK); return false; }
  catch { return true; }
}

function addHostsEntries(sites: string[]): void {
  let hosts = fs.readFileSync(HOSTS_FILE, 'utf8');

  // Remove any existing codefi block
  hosts = removeHostsBlock(hosts);

  const block = [
    '',
    HOSTS_MARKER_START,
    ...sites.map(s => `0.0.0.0 ${s}`),
    HOSTS_MARKER_END,
    '',
  ].join('\n');

  fs.writeFileSync(HOSTS_FILE, hosts + block);
}

function removeHostsBlock(content: string): string {
  const re = new RegExp(
    `\\n?${HOSTS_MARKER_START}[\\s\\S]*?${HOSTS_MARKER_END}\\n?`,
    'g'
  );
  return content.replace(re, '');
}

function removeHostsEntries(): void {
  if (!fs.existsSync(HOSTS_FILE)) return;
  const hosts   = fs.readFileSync(HOSTS_FILE, 'utf8');
  const cleaned = removeHostsBlock(hosts);
  fs.writeFileSync(HOSTS_FILE, cleaned);
}

// ─── DND / notifications ──────────────────────────────────────────────────────
function enableDND(): void {
  try {
    if (process.platform === 'darwin') {
      // macOS: enable Do Not Disturb via osascript
      spawn('osascript', ['-e',
        'tell application "System Events" to tell process "SystemUIServer" to ' +
        'set value of checkbox 1 of window "Control Center" to true'
      ], { shell: false, stdio: 'ignore' });
    } else if (process.platform === 'linux') {
      // GNOME: pause notifications
      spawn('gsettings', ['set', 'org.gnome.desktop.notifications', 'show-banners', 'false'],
        { shell: false, stdio: 'ignore' });
    }
    // Windows: no reliable cross-version API, skip silently
  } catch {}
}

function disableDND(): void {
  try {
    if (process.platform === 'darwin') {
      spawn('osascript', ['-e',
        'tell application "System Events" to tell process "SystemUIServer" to ' +
        'set value of checkbox 1 of window "Control Center" to false'
      ], { shell: false, stdio: 'ignore' });
    } else if (process.platform === 'linux') {
      spawn('gsettings', ['set', 'org.gnome.desktop.notifications', 'show-banners', 'true'],
        { shell: false, stdio: 'ignore' });
    }
  } catch {}
}

// ─── Session store ────────────────────────────────────────────────────────────
function saveFocus(session: FocusSession): void {
  const dir = path.dirname(FOCUS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FOCUS_FILE, JSON.stringify(session, null, 2));
}

function loadFocus(): FocusSession | null {
  try {
    if (!fs.existsSync(FOCUS_FILE)) return null;
    return JSON.parse(fs.readFileSync(FOCUS_FILE, 'utf8')) as FocusSession;
  } catch { return null; }
}

function clearFocus(): void {
  try { if (fs.existsSync(FOCUS_FILE)) fs.unlinkSync(FOCUS_FILE); } catch {}
}

function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2,'0')}s`;
  return `${s}s`;
}

// ─── Sub-commands ─────────────────────────────────────────────────────────────

const startCmd = new Command('start')
  .description('Enter focus mode')
  .argument('[minutes]', 'Duration in minutes (default: unlimited)')
  .option('-m, --mood <mood>',     'Music mood during focus', 'focus')
  .option('--no-block',            'Skip website blocking')
  .option('--no-music',            'Skip auto-playing music')
  .option('--blocklist <sites...>','Custom sites to block')
  .action(async (minutesArg: string | undefined, options) => {
    const existing = loadFocus();
    if (existing) {
      const elapsed = Math.floor((Date.now() - new Date(existing.startedAt).getTime()) / 1000);
      logger.warning(`Focus mode already active (${fmtDuration(elapsed)})`);
      logger.info('Stop it first: codefi focus stop');
      return;
    }

    const minutes   = minutesArg ? parseInt(minutesArg, 10) : 0;
    const blocklist = options.blocklist ?? DEFAULT_BLOCK_LIST;

    logger.newLine();
    logger.box('⚡ FOCUS MODE ACTIVATED');
    logger.newLine();

    // Block sites
    if (options.block !== false) {
      if (requiresRoot()) {
        logger.warning('Website blocking requires sudo on this system.');
        logger.info('Run: sudo codefi focus start');
        logger.info('Continuing without website blocking...');
      } else {
        try {
          addHostsEntries(blocklist);
          logger.success(`Blocked ${blocklist.length} distracting sites`);
        } catch (err: any) {
          logger.warning(`Could not block sites: ${err.message}`);
        }
      }
    }

    // Enable DND
    enableDND();
    logger.success('Do Not Disturb enabled');

    // Start music
    if (options.music !== false) {
      try {
        const mood  = options.mood;
        const track = configService.isPro()
          ? DEFAULT_PLAYLISTS.find(p => p.mood === mood)?.tracks[0]
          : getFreeTierTrack(mood);

        if (track) {
          const trackPath = await trackDownloader.getTrack(track.filepath);
          await audioService.play(trackPath, configService.get('defaultVolume') as number ?? 70);
          logger.success(`Playing: ${track.title} — ${track.artist}`);
        }
      } catch (err: any) {
        logger.warning(`Could not start music: ${err.message}`);
      }
    }

    const session: FocusSession = {
      startedAt: new Date().toISOString(),
      minutes,
      blocklist,
      mood: options.mood,
    };
    saveFocus(session);

    logger.newLine();
    if (minutes > 0) {
      console.log(chalk.hex(COLORS.PRIMARY)(`  ⚡ Focusing for ${minutes} minutes`));
    } else {
      console.log(chalk.hex(COLORS.PRIMARY)('  ⚡ Focusing until you say stop'));
    }
    logger.newLine();
    logger.info('Stop with: codefi focus stop');
    logger.newLine();

    // Auto-stop timer if duration set
    if (minutes > 0) {
      console.log(chalk.gray(`  Timer set — will stop in ${minutes} minutes`));
      setTimeout(async () => {
        await stopFocusMode();
        process.exit(0);
      }, minutes * 60_000).unref();
    }
  });

async function stopFocusMode(): Promise<void> {
  const session = loadFocus();

  // Remove hosts entries
  try { removeHostsEntries(); } catch {}

  // Disable DND
  disableDND();

  // Stop music
  try {
    if (audioService.isPlaying()) audioService.stop();
  } catch {}

  clearFocus();

  logger.newLine();
  logger.box('FOCUS MODE ENDED');
  logger.newLine();

  if (session) {
    const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
    logger.success(`Focus session: ${fmtDuration(elapsed)}`);
  }

  logger.success('Notifications restored');
  logger.success('Website blocking removed');
  logger.newLine();
}

const stopCmd = new Command('stop')
  .description('Exit focus mode')
  .action(async () => {
    const session = loadFocus();
    if (!session) {
      logger.info('Focus mode is not active');
      return;
    }
    await stopFocusMode();
  });

const statusCmd = new Command('status')
  .description('Show focus mode status')
  .action(() => {
    const session = loadFocus();
    logger.newLine();

    if (!session) {
      logger.info('Focus mode is not active');
      logger.info('Start with: codefi focus start');
    } else {
      const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
      console.log(chalk.hex(COLORS.PRIMARY)('  ⚡ Focus mode ACTIVE'));
      console.log(chalk.gray(`     Duration:  ${fmtDuration(elapsed)}`));
      console.log(chalk.gray(`     Mood:      ${session.mood}`));
      if (session.minutes > 0) {
        const remaining = session.minutes * 60 - elapsed;
        if (remaining > 0) {
          console.log(chalk.gray(`     Remaining: ${fmtDuration(remaining)}`));
        }
      }
      console.log(chalk.gray(`     Blocking:  ${session.blocklist.length} sites`));
    }
    logger.newLine();
  });

// ─── Root ─────────────────────────────────────────────────────────────────────
export const focusCommand = new Command('focus')
  .description('Enter deep focus mode (DND + block sites + music)')
  .addCommand(startCmd)
  .addCommand(stopCmd)
  .addCommand(statusCmd)
  .action(() => { statusCmd.parseAsync([], { from: 'user' }); });

export default focusCommand;