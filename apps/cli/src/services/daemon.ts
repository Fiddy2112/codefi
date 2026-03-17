import net  from 'net';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { audioService }   from '@/services/audio';
import { trackDownloader } from '@/services/trackDownloader';
import { configService }  from '@/services/config';
import { visualizer }     from '@/ui/visualizer';
import {
  DEFAULT_PLAYLISTS,
  FREE_TIER_TRACKS,
  getFreeTierTrack,
} from '@/utils/constants';
import { writeNowPlaying, clearNowPlaying } from '@/commands/status';
import { appendHistory }  from '@/commands/history';
import { shiftQueue }     from '@/commands/queue';
import { loadKeybinds }   from '@/commands/keybinds';
import type { MoodType, Track } from '@/types';
import { youtubeService } from '@/services/youtube';

export const DAEMON_SOCK = path.join(os.homedir(), '.codefi', 'daemon.sock');
export const DAEMON_PID  = path.join(os.homedir(), '.codefi', 'daemon.pid');
export const DAEMON_LOG  = path.join(os.homedir(), '.codefi', 'daemon.log');

// ─── State ────────────────────────────────────────────────────────────────────
interface DaemonState {
  playing:      boolean;
  paused:       boolean;
  title:        string;
  artist:       string;
  mood:         MoodType;
  volume:       number;
  source:       string;
  startedAt:    string;
  trackIndex:   number;
  playableTracks: Track[];
}

const state: DaemonState = {
  playing:       false,
  paused:        false,
  title:         '',
  artist:        '',
  mood:          'focus',
  volume:        70,
  source:        'local',
  startedAt:     '',
  trackIndex:    0,
  playableTracks:[],
};

// ─── IPC message types ────────────────────────────────────────────────────────
export type DaemonCmd =
  | { cmd: 'PLAY';   mood?: MoodType; volume?: number; youtube?: string; url?: string; spotify?: string }
  | { cmd: 'STOP' }
  | { cmd: 'PAUSE' }
  | { cmd: 'RESUME' }
  | { cmd: 'NEXT' }
  | { cmd: 'PREV' }
  | { cmd: 'VOLUME'; value: number }
  | { cmd: 'MUTE' }
  | { cmd: 'STATUS' }
  | { cmd: 'PING' };

export interface DaemonReply {
  ok:     boolean;
  error?: string;
  state?: Omit<DaemonState, 'playableTracks'>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function publicState(): Omit<DaemonState, 'playableTracks'> {
  const { playableTracks: _, ...pub } = state;
  return pub;
}

async function loadTrack(mood: MoodType): Promise<{ path: string; track: Track }> {
  const isPro = configService.isPro();
  let track: Track;

  if (isPro) {
    const playlist = DEFAULT_PLAYLISTS.find(p => p.mood === mood);
    if (!playlist || playlist.tracks.length === 0) throw new Error(`No tracks for mood: ${mood}`);
    track = playlist.tracks[state.trackIndex % playlist.tracks.length];
    state.playableTracks = playlist.tracks;
  } else {
    track = getFreeTierTrack(mood);
    state.playableTracks = [...FREE_TIER_TRACKS];
    state.trackIndex     = FREE_TIER_TRACKS.findIndex(t => t.mood === mood);
    if (state.trackIndex < 0) state.trackIndex = 0;
  }

  const trackPath = await trackDownloader.getTrack(track.filepath);
  return { path: trackPath, track };
}

async function startPlayback(opts: { mood?: MoodType; volume?: number }) {
  const mood   = opts.mood   ?? state.mood;
  const volume = opts.volume ?? state.volume;

  const { path: trackPath, track } = await loadTrack(mood);

  await audioService.play(trackPath, volume);

  state.playing   = true;
  state.paused    = false;
  state.title     = track.title;
  state.artist    = track.artist;
  state.mood      = mood;
  state.volume    = volume;
  state.source    = 'local';
  state.startedAt = new Date().toISOString();

  writeNowPlaying({
    title: track.title, artist: track.artist,
    mood, volume, source: 'local',
    startedAt: state.startedAt, isPaused: false,
  });

  visualizer.setTrackInfo(track.title, track.artist);
  visualizer.updateVolume(volume);
  visualizer.start();
}

async function switchTrack(delta: 1 | -1) {
  if (state.playableTracks.length === 0) return;

  // Record history for current track
  if (state.title) {
    appendHistory({
      title: state.title, artist: state.artist,
      mood: state.mood, source: state.source,
      duration: Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000),
    });
  }

  // Check queue on 'next'
  if (delta === 1) {
    const queued = shiftQueue();
    if (queued) {
      audioService.stop();
      let trackPath: string;
      if (queued.source === 'youtube') {
        trackPath = await youtubeService.downloadAudio(queued.ref);
      } else {
        trackPath = queued.ref;
      }
      await audioService.play(trackPath, state.volume);
      state.title  = queued.title;
      state.artist = queued.artist;
      state.source = queued.source;
      state.startedAt = new Date().toISOString();
      visualizer.setTrackInfo(queued.title, queued.artist);
      return;
    }
  }

  const len = state.playableTracks.length;
  state.trackIndex = ((state.trackIndex + delta) % len + len) % len;
  const track = state.playableTracks[state.trackIndex];

  audioService.stop();
  const trackPath = await trackDownloader.getTrack(track.filepath);
  await audioService.play(trackPath, state.volume);

  state.title  = track.title;
  state.artist = track.artist;
  state.startedAt = new Date().toISOString();
  visualizer.setTrackInfo(track.title, track.artist);

  writeNowPlaying({
    title: track.title, artist: track.artist,
    mood: state.mood, volume: state.volume,
    source: state.source,
    startedAt: state.startedAt, isPaused: false,
  });
}

// ─── Command handler ──────────────────────────────────────────────────────────
async function handleCommand(msg: DaemonCmd): Promise<DaemonReply> {
  try {
    switch (msg.cmd) {

      case 'PING':
        return { ok: true, state: publicState() };

      case 'STATUS':
        return { ok: true, state: publicState() };

      case 'PLAY': {
        const volume = msg.volume ?? (configService.get('defaultVolume') as number ?? 70);
        const mood   = (msg.mood ?? configService.get('defaultMood') as MoodType) ?? 'focus';
        await startPlayback({ mood, volume });
        return { ok: true, state: publicState() };
      }

      case 'STOP':
        if (state.title) {
          appendHistory({
            title: state.title, artist: state.artist,
            mood: state.mood, source: state.source,
            duration: Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000),
          });
        }
        audioService.stop();
        visualizer.stop();
        clearNowPlaying();
        state.playing = false;
        state.paused  = false;
        // Daemon exits after STOP
        setTimeout(() => process.exit(0), 200);
        return { ok: true, state: publicState() };

      case 'PAUSE':
        audioService.pause();
        visualizer.updateStatus('PAUSED');
        visualizer.stop();
        state.paused = true;
        writeNowPlaying({ ...publicState(), isPaused: true });
        return { ok: true, state: publicState() };

      case 'RESUME':
        audioService.resume();
        visualizer.updateStatus('PLAYING');
        visualizer.start();
        state.paused = false;
        writeNowPlaying({ ...publicState(), isPaused: false });
        return { ok: true, state: publicState() };

      case 'NEXT':
        await switchTrack(1);
        return { ok: true, state: publicState() };

      case 'PREV':
        await switchTrack(-1);
        return { ok: true, state: publicState() };

      case 'VOLUME': {
        const vol = Math.max(0, Math.min(100, msg.value));
        audioService.setVolume(vol);
        visualizer.updateVolume(vol);
        state.volume = vol;
        return { ok: true, state: publicState() };
      }

      case 'MUTE': {
        if (state.volume > 0) {
          configService.set('lastVolume', state.volume);
          state.volume = 0;
        } else {
          state.volume = (configService.get('lastVolume') as number) || 50;
        }
        audioService.setVolume(state.volume);
        visualizer.updateVolume(state.volume);
        return { ok: true, state: publicState() };
      }

      default:
        return { ok: false, error: `Unknown command: ${(msg as any).cmd}` };
    }
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ─── Socket server ────────────────────────────────────────────────────────────
function startServer(): net.Server {
  // Clean up stale socket from previous crash
  if (fs.existsSync(DAEMON_SOCK)) {
    try { fs.unlinkSync(DAEMON_SOCK); } catch {}
  }

  const server = net.createServer((socket) => {
    let buf = '';

    socket.on('data', (chunk) => {
      buf += chunk.toString();
      // Messages are newline-delimited JSON
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as DaemonCmd;
          handleCommand(msg).then((reply) => {
            socket.write(JSON.stringify(reply) + '\n');
          });
        } catch {
          socket.write(JSON.stringify({ ok: false, error: 'Invalid JSON' }) + '\n');
        }
      }
    });

    socket.on('error', () => {});
  });

  server.listen(DAEMON_SOCK, () => {
    // Socket created — set permissions so only current user can connect
    try { fs.chmodSync(DAEMON_SOCK, 0o600); } catch {}
  });

  return server;
}

// ─── Keyboard controls (when run in interactive mode) ─────────────────────────
function setupKeyboard() {
  if (!process.stdin.isTTY) return;

  const readline = require('readline');
  readline.emitKeypressEvents(process.stdin);

  setTimeout(() => {
    try { process.stdin.setRawMode(true); } catch {}
  }, 300);

  const keys = loadKeybinds();

  process.stdin.on('keypress', (str: string, key: any) => {
    if (!key) return;
    if (key.name === keys.quit || (key.ctrl && key.name === 'c')) {
      handleCommand({ cmd: 'STOP' });
      return;
    }
    if (key.name === keys.pauseResume || key.name === 'space') {
      handleCommand({ cmd: state.paused ? 'RESUME' : 'PAUSE' });
      return;
    }
    if (key.name === keys.nextTrack || key.sequence === '\u001b[C') {
      handleCommand({ cmd: 'NEXT' });
      return;
    }
    if (key.name === keys.prevTrack || key.sequence === '\u001b[D') {
      handleCommand({ cmd: 'PREV' });
      return;
    }
    if (key.name === 'up' || key.sequence === '\u001b[A' || str === keys.volumeUp) {
      handleCommand({ cmd: 'VOLUME', value: state.volume + 5 });
      return;
    }
    if (key.name === 'down' || key.sequence === '\u001b[B' || str === keys.volumeDown) {
      handleCommand({ cmd: 'VOLUME', value: state.volume - 5 });
      return;
    }
    if (key.name === keys.mute) {
      handleCommand({ cmd: 'MUTE' });
      return;
    }
  });

  process.stdin.resume();
}

// ─── Entry point (called when this file is run directly) ─────────────────────
export async function startDaemon(opts: {
  mood?:        MoodType;
  volume?:      number;
  interactive?: boolean; // show visualizer + keyboard
}) {
  // Write PID file
  const dir = path.dirname(DAEMON_PID);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DAEMON_PID, String(process.pid));

  // Redirect stdout/stderr to log file when running detached
  if (!opts.interactive) {
    const log = fs.createWriteStream(DAEMON_LOG, { flags: 'a' });
    process.stdout.write = log.write.bind(log);
    process.stderr.write = log.write.bind(log);
  }

  // Start IPC server
  startServer();

  // Cleanup on exit
  const cleanup = () => {
    try { audioService.stop();           } catch {}
    try { visualizer.stop();             } catch {}
    try { clearNowPlaying();             } catch {}
    try { fs.unlinkSync(DAEMON_SOCK);    } catch {}
    try { fs.unlinkSync(DAEMON_PID);     } catch {}
    if (process.stdin.isTTY) {
      try { process.stdin.setRawMode(false); } catch {}
    }
  };

  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('exit',    cleanup);

  // Start playback
  if (opts.mood !== undefined || opts.volume !== undefined) {
    try {
      await startPlayback({
        mood:   opts.mood   ?? 'focus',
        volume: opts.volume ?? (configService.get('defaultVolume') as number ?? 70),
      });
    } catch (err: any) {
      process.stderr.write(`Daemon: playback failed — ${err.message}\n`);
      cleanup();
      process.exit(1);
    }
  }

  // Set up keyboard if interactive
  if (opts.interactive) {
    setupKeyboard();
  }
}

// When run as: node daemon.js --mood focus --volume 70 --interactive
if (require.main === module) {
  const args    = process.argv.slice(2);
  const getArg  = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  startDaemon({
    mood:        (getArg('--mood') as MoodType | undefined),
    volume:      getArg('--volume') ? parseInt(getArg('--volume')!, 10) : undefined,
    interactive: args.includes('--interactive'),
  }).catch((err) => {
    process.stderr.write(`Daemon startup failed: ${err.message}\n`);
    process.exit(1);
  });
}