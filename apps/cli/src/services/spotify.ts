import { spawn } from 'child_process';
import { configService } from './config';
import { logger } from './logger';
import type { Track, Playlist } from '../types';

class SpotifyService {
  private clientId = process.env.SPOTIFY_CLIENT_ID || '';
  private clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';

  // Check if Spotify is connected
  isConnected(): boolean {
    return !!configService.get('spotifyRefreshToken');
  }

  // Connect Spotify (OAuth flow)
  async connect(): Promise<void> {
    if (!configService.isPro()) {
      throw new Error('Spotify integration requires CodeFi Pro');
    }

    logger.info('🎵 Opening Spotify authorization...');
    
    // Open browser for OAuth
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${this.clientId}&response_type=code&redirect_uri=http://localhost:8888/callback&scope=user-read-playback-state,user-modify-playback-state`;
    
    // Open browser
    const open = process.platform === 'win32' ? 'start' : 'open';
    spawn(open, [authUrl], { shell: true });

    logger.info('Waiting for authorization...');
    logger.info('If browser doesn\'t open, visit: ' + authUrl);
    
    // In production: Run local server to catch callback
    // For now: Manual token input
    logger.warning('Feature coming soon! Manual setup:');
    logger.info('1. Visit: https://developer.spotify.com/console/');
    logger.info('2. Get your token');
    logger.info('3. Run: codefi config set spotify-token YOUR_TOKEN');
  }

  // Search Spotify playlists
  async searchPlaylists(query: string): Promise<Playlist[]> {
    if (!this.isConnected()) {
      throw new Error('Spotify not connected. Run: codefi spotify connect');
    }

    // Mock data for now (implement real API call in production)
    logger.info(`🔍 Searching Spotify for: ${query}`);
    
    return [
      {
        id: 'spotify-1',
        name: 'Lofi Hip Hop Radio',
        mood: 'focus',
        source: 'spotify',
        tracks: [
          {
            id: 'spotify-track-1',
            title: 'Lofi Beat 1',
            artist: 'Chillhop Music',
            duration: 180,
            mood: 'focus',
            filepath: '', // Streamed
            source: 'spotify',
            spotifyId: 'abc123',
          },
        ],
      },
    ];
  }

  // Play Spotify track (uses Spotify Connect API)
  async playTrack(spotifyId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Spotify not connected');
    }

    logger.info('▶️  Playing via Spotify Connect...');
    
    // In production: Call Spotify API to start playback
    // For now: Open in Spotify app
    const spotifyUrl = `spotify:track:${spotifyId}`;
    const open = process.platform === 'win32' ? 'start' : 'open';
    spawn(open, [spotifyUrl], { shell: true });
  }

  // Disconnect Spotify
  disconnect(): void {
    configService.set('spotifyRefreshToken', undefined);
    configService.set('spotifyConnected', false);
    logger.success('Spotify disconnected');
  }
}

export const spotifyService = new SpotifyService();