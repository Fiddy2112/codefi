import { RefAttributes } from 'react';
import {MoodType, Playlist } from '../types';
import {LucideIcon, BrainCircuit,Swords,Bug,Flower,Blend} from 'lucide-react';

export const COLORS = {
    PRIMARY: '#00FF41',
    SECONDARY: '#00cc33',
    BACKGROUND: '#0E1117',
    DARK: '#1a1d29',
    GRAY: '#2a2d3a',
    TEXT: '#e0e0e0',
    ERROR: '#ff4444',
    WARNING: '#ffaa00',
    SUCCESS: '#00FF41',
  } as const;

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
          filepath: 'assets/tracks/midnight-code.mp3',
        },
        {
          id: 'track-2',
          title: 'Terminal Dreams',
          artist: 'Synth Wave',
          duration: 210,
          mood: 'focus',
          filepath: 'assets/tracks/terminal-dreams.mp3',
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
          filepath: 'assets/tracks/coffee-code.mp3',
        },
      ],
    },
  ];
  
  export const POMODORO = {
    WORK_DURATION: 25, // minutes
    BREAK_DURATION: 5, // minutes
    LONG_BREAK_DURATION: 15, // minutes
    SESSIONS_BEFORE_LONG_BREAK: 4,
  } as const;

  export const MESSAGES = {
    WELCOME: `
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║     <|||> CodeFi                      ║
  ║     Brewing beats for your code       ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
    `,

    FLOW_ACTIVATED: '⚡ Flow state: ACTIVATED',
    MUSIC_PLAYING: '🎧 Now playing:',
    MUSIC_STOPPED: '⏹️  Music stopped',
    MUSIC_PAUSED: '⏸️  Music paused',
    
    PRO_REQUIRED: '🔒 This feature requires CodeFi Pro ($5/mo)',
    NOT_LOGGED_IN: '❌ Please login first: codefi login',
    
    ERROR: '❌ Error:',
    SUCCESS: '✓',
    INFO: 'ℹ',
    WARNING: '⚠',
  } as const;

  export const API = {
    BASE_URL: process.env.SUPABASE_URL || '',
    ENDPOINTS: {
      AUTH: '/auth/v1',
      TRACKS: '/rest/v1/tracks',
      PLAYLISTS: '/rest/v1/playlists',
      SESSIONS: '/rest/v1/pomodoro_sessions',
    },
  } as const;

  export const PATHS = {
    CONFIG_DIR: '.codefi',
    CONFIG_FILE: 'config.json',
    TRACKS_DIR: 'tracks',
    CACHE_DIR: 'cache',
  } as const;

  export const AUDIO = {
    DEFAULT_VOLUME: 70,
    MAX_VOLUME: 100,
    MIN_VOLUME: 0,
    FADE_DURATION: 2000, // ms
    FORMATS: ['mp3', 'wav', 'ogg'],
  } as const;

