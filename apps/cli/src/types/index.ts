export type MoodType = 'focus' | 'chill' | 'debug' | 'flow' | 'creative';

export interface Track {
    id:string;
    title:string;
    artist: string;
    duration: number;
    mood: MoodType;
    filepath: string;
    isPro?: boolean;
}

export interface Playlist {
    id: string;
    name: string;
    mood: MoodType;
    tracks: Track[];
    isCustom?: boolean;
}

export interface PlayerState {
    isPlaying: boolean;
    currentTrack: Track | null;
    volume: number;
    mood: MoodType;
    repeat: boolean;
    shuffle: boolean;
}

export interface PomodoroSession {
    id: string;
    startTime: Date;
    endTime?: Date;
    duration: number; // in minutes
    type: 'work' | 'break';
    mood?: MoodType;
    completed: boolean;
}

export interface UserConfig {
    userId?: string;
    isPro: boolean;
    token?: string;
    defaultMood: MoodType;
    defaultVolume: number;
    pomodoroWorkDuration: number;
    pomodoroBreakDuration: number;
    autoStartPomodoro: boolean;
    spotifyConnected: boolean;
    notifications: boolean;
}

export interface CLIOptions {
    mood?: MoodType;
    volume?: number;
    track?: string;
    playlist?: string;
    repeat?: boolean;
    shuffle?: boolean;
}

export interface APIResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}