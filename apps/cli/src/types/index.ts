export type MoodType = 'focus' | 'chill' | 'debug' | 'flow' | 'creative';

export type TrackSource = 'local' | 'cdn' | 'spotify' | 'youtube' | 'url';

export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  mood: MoodType;
  filepath: string;
  isPro?: boolean;
  source?: TrackSource;
  externalUrl?: string; // For Spotify/YouTube
  spotifyId?: string;
  youtubeId?: string;
}

export interface Playlist {
  id: string;
  name: string;
  mood: MoodType;
  tracks: Track[];
  isCustom?: boolean;
  source?: TrackSource;
}

export interface PlayerState {
  isPlaying: boolean;
  currentTrack: Track | null;
  volume: number;
  mood: MoodType;
  repeat: boolean;
  shuffle: boolean;
  source?: TrackSource;
}

export interface PomodoroSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  duration: number;
  type: 'work' | 'break';
  mood?: MoodType;
  completed: boolean;
}

export interface UserConfig {
  userId?: string;
  email?: string;
  isPro: boolean;
  token?: string;
  refreshToken?: string;
  defaultMood: MoodType;
  defaultVolume: number;
  pomodoroWorkDuration: number;
  pomodoroBreakDuration: number;
  autoStartPomodoro: boolean;
  spotifyConnected: boolean;
  spotifyRefreshToken?: string;
  notifications: boolean;
  lastVolume?: number; // For mute/unmute
}

export interface CLIOptions {
  mood?: MoodType;
  volume?: number;
  track?: string;
  playlist?: string;
  repeat?: boolean;
  shuffle?: boolean;
  spotify?: string; // Spotify playlist name/ID
  youtube?: string; // YouTube URL
  url?: string; // Custom URL
  aiMood?: boolean; // AI mood detection
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// AI Mood Detection
export interface CodeActivity {
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  commits: number;
  language: string;
  timeOfDay: number; // 0-23
  isDebugging: boolean;
}

export interface AIMoodResult {
  mood: MoodType;
  confidence: number;
  reason: string;
}