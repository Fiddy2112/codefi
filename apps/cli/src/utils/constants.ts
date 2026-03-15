import type { MoodType, Playlist, Track } from '../types';

// ─── Terminal Colors ──────────────────────────────────────────────────────────
export const COLORS = {
  PRIMARY:    '#00FF41',
  SECONDARY:  '#00cc33',
  BACKGROUND: '#0E1117',
  DARK:       '#1a1d29',
  GRAY:       '#2a2d3a',
  TEXT:       '#e0e0e0',
  ERROR:      '#ff4444',
  WARNING:    '#ffaa00',
  SUCCESS:    '#00FF41',
} as const;

// ─── Mood Configurations ──────────────────────────────────────────────────────
export const MOODS: Record<MoodType, {
  name: string;
  description: string;
  emoji: string;
  color: string;
  tempo: string;
}> = {
  focus: {
    name: 'Deep Focus',
    description: 'Intense concentration mode',
    emoji: '🎯',
    color: COLORS.PRIMARY,
    tempo: 'slow',
  },
  chill: {
    name: 'Chill Vibes',
    description: 'Relaxed coding session',
    emoji: '😌',
    color: '#88ccff',
    tempo: 'medium',
  },
  debug: {
    name: 'Debug Mode',
    description: 'Hunt those bugs!',
    emoji: '🐛',
    color: '#ff6b6b',
    tempo: 'fast',
  },
  flow: {
    name: 'Flow State',
    description: 'Peak productivity',
    emoji: '⚡',
    color: COLORS.PRIMARY,
    tempo: 'medium-fast',
  },
  creative: {
    name: 'Creative Mode',
    description: 'Innovation time',
    emoji: '🎨',
    color: '#9b59b6',
    tempo: 'varied',
  },
};

// ─── Default Playlists (used by Pro tier) ────────────────────────────────────
export const DEFAULT_PLAYLISTS: Playlist[] = [
  {
    id: 'focus-1',
    name: 'Deep Focus Mix',
    mood: 'focus',
    tracks: [
      {
        id: 'track-1',
        title: 'Midnight Code',
        artist: 'Lo-fi Beats',
        duration: 180,
        mood: 'focus',
        filepath: 'midnight-code.mp3',
        isPro: false,
      },
      {
        id: 'track-2',
        title: 'Terminal Dreams',
        artist: 'Synth Wave',
        duration: 210,
        mood: 'focus',
        filepath: 'terminal-dreams.mp3',
        isPro: true,
      },
    ],
  },
  {
    id: 'chill-1',
    name: 'Chill Coding',
    mood: 'chill',
    tracks: [
      {
        id: 'track-3',
        title: 'Coffee & Code',
        artist: 'Calm Beats',
        duration: 195,
        mood: 'chill',
        filepath: 'coffee-code.mp3',
        isPro: false,
      },
    ],
  },
  {
    id: 'debug-1',
    name: 'Debug Mode',
    mood: 'debug',
    tracks: [
      {
        id: 'track-4',
        title: 'Bug Hunt',
        artist: 'Code Warriors',
        duration: 200,
        mood: 'debug',
        filepath: 'bug-hunt.mp3',
        isPro: false,
      },
    ],
  },
  {
    id: 'flow-1',
    name: 'Flow State',
    mood: 'flow',
    tracks: [
      {
        id: 'track-5',
        title: 'In The Zone',
        artist: 'Focus Masters',
        duration: 220,
        mood: 'flow',
        filepath: 'in-the-zone.mp3',
        isPro: false,
      },
    ],
  },
  {
    id: 'creative-1',
    name: 'Creative Mode',
    mood: 'creative',
    tracks: [
      {
        id: 'track-6',
        title: 'Innovation Hour',
        artist: 'Creative Minds',
        duration: 240,
        mood: 'creative',
        filepath: 'innovation-hour.mp3',
        isPro: false,
      },
    ],
  },
];

// ─── Free Tier Tracks ─────────────────────────────────────────────────────────
// must cover ALL 5 moods — play.ts does FREE_TIER_TRACKS.findIndex(t => t.mood === mood)
// If a mood is missing, findIndex returns -1 and falls back to index 0 silently.
// Better to have an explicit track per mood so the fallback is intentional.
export const FREE_TIER_TRACKS: Track[] = [
  {
    id: 'free-1',
    title: 'Midnight Code',
    artist: 'Lo-fi Beats',
    duration: 180,
    mood: 'focus',
    filepath: 'midnight-code.mp3',
    isPro: false,
  },
  {
    id: 'free-2',
    title: 'Coffee & Code',
    artist: 'Calm Beats',
    duration: 195,
    mood: 'chill',
    filepath: 'coffee-code.mp3',
    isPro: false,
  },
  {
    id: 'free-3',
    title: 'Bug Hunt',
    artist: 'Code Warriors',
    duration: 200,
    mood: 'debug',
    filepath: 'bug-hunt.mp3',
    isPro: false,
  },
  // FIX: flow and creative were missing — play.ts silently played 'focus' for both
  {
    id: 'free-4',
    title: 'In The Zone',
    artist: 'Focus Masters',
    duration: 220,
    mood: 'flow',
    filepath: 'in-the-zone.mp3', // reuses existing asset
    isPro: false,
  },
  {
    id: 'free-5',
    title: 'Innovation Hour',
    artist: 'Creative Minds',
    duration: 240,
    mood: 'creative',
    filepath: 'innovation-hour.mp3', // reuses existing asset
    isPro: false,
  },
];

// ─── Runtime helper: get the free track for a given mood ─────────────────────
// Centralises the fallback logic so play.ts doesn't have to inline it.
export function getFreeTierTrack(mood: MoodType): Track {
  return (
    FREE_TIER_TRACKS.find((t) => t.mood === mood) ?? FREE_TIER_TRACKS[0]
  );
}

// ─── Pomodoro Settings ────────────────────────────────────────────────────────
export const POMODORO = {
  WORK_DURATION:              25, // minutes
  BREAK_DURATION:              5, // minutes
  LONG_BREAK_DURATION:        15, // minutes
  SESSIONS_BEFORE_LONG_BREAK:  4,
} as const;

// ─── CLI Messages ─────────────────────────────────────────────────────────────
export const MESSAGES = {
  WELCOME: `
╔═══════════════════════════════════════╗
║                                       ║
║     <|||> CodeFi                      ║
║     Brewing beats for your code       ║
║                                       ║
╚═══════════════════════════════════════╝
  `,

  FLOW_ACTIVATED:  '⚡ Flow state: ACTIVATED',
  MUSIC_PLAYING:   '🎧 Now playing:',
  MUSIC_STOPPED:   '⏹️  Music stopped',
  MUSIC_PAUSED:    '⏸️  Music paused',
  MUSIC_RESUMED:   '▶️  Music resumed',  // FIX: was missing, used in play.ts resume flow

  PRO_REQUIRED:    '🔒 This feature requires CodeFi Pro ($5/mo)',
  NOT_LOGGED_IN:   '❌ Please login first: codefi login',

  // FIX: WARNING was missing — logger.ts uses MESSAGES.WARNING
  ERROR:   '❌',
  SUCCESS: '✓',
  INFO:    'ℹ',
  WARNING: '⚠',
} as const;

// ─── API Endpoints ────────────────────────────────────────────────────────────
export const API = {
  BASE_URL: process.env.SUPABASE_URL ?? '',
  ENDPOINTS: {
    AUTH:       '/auth/v1',
    TRACKS:     '/rest/v1/tracks',
    PLAYLISTS:  '/rest/v1/playlists',
    SESSIONS:   '/rest/v1/pomodoro_sessions',
  },
} as const;

// ─── Config File Paths ────────────────────────────────────────────────────────
export const PATHS = {
  CONFIG_DIR:  '.codefi',
  CONFIG_FILE: 'config.json',
  TRACKS_DIR:  'tracks',
  CACHE_DIR:   'cache',
} as const;

// ─── Audio Settings ───────────────────────────────────────────────────────────
export const AUDIO = {
  DEFAULT_VOLUME: 70,
  MAX_VOLUME:    100,
  MIN_VOLUME:      0,
  FADE_DURATION: 2000, // ms
  FORMATS: ['mp3', 'wav', 'ogg'] as const,
} as const;