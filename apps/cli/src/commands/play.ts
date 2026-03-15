import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import chalk from 'chalk';
import { configService } from '../services/config';
import { trackDownloader } from '../services/trackDownloader';
import { spotifyService } from '../services/spotify';
import { youtubeService } from '../services/youtube';
import { aiService } from '../services/ai';
import { audioService } from '../services/audio';
import { logger } from '../services/logger';
import { visualizer } from '../ui/visualizer';
import { DEFAULT_PLAYLISTS, FREE_TIER_TRACKS, getFreeTierTrack } from '../utils/constants';
import { writeNowPlaying, clearNowPlaying } from './status';
import { appendHistory } from './history';
import { shiftQueue } from './queue';
import { loadKeybinds } from './keybinds';
import type { MoodType, Track } from '../types';
import os from 'os';

// Sleep timer check
const SLEEP_FILE = path.join(os.homedir(), '.codefi', 'sleep-timer.json');

function checkSleepTimer(): boolean {
  try {
    if (!fs.existsSync(SLEEP_FILE)) return false;
    const { stopAt } = JSON.parse(fs.readFileSync(SLEEP_FILE, 'utf8'));
    return new Date(stopAt).getTime() <= Date.now();
  } catch { return false; }
}

export const playCommand = new Command('play')
  .description('Start playing music')
  .option('-m, --mood <mood>',    'Select mood (focus, chill, debug, flow, creative)')
  .option('-v, --volume <number>','Set volume (0-100)')
  .option('--spotify <query>',    'Play from Spotify (Pro)')
  .option('--youtube <url>',      'Play from YouTube (Pro)')
  .option('--url <url>',          'Play from custom URL (Pro)')
  .option('--ai-mood',            'Auto-detect mood with AI (Pro)')
  .action(async (options) => {
    try {
      let trackPath!:  string;
      let trackTitle!: string;
      let trackArtist!:string;
      let mood!:       MoodType;
      let source = 'local';

      // Load keybinds (custom or default)
      const keys = loadKeybinds();

      // ── AI mood detection ───────────────────────────────────────────────────
      if (options.aiMood) {
        if (!configService.isPro()) { logger.proRequired(); process.exit(1); }
        const r = await aiService.detectMood();
        logger.success(`🤖 AI detected mood: ${r.mood} (${(r.confidence * 100).toFixed(0)}% confidence)`);
        logger.info(`💡 ${r.reason}`);
        logger.newLine();
        mood = r.mood;
      }

      // ── Spotify ─────────────────────────────────────────────────────────────
      if (options.spotify) {
        if (!configService.isPro()) { logger.proRequired(); process.exit(1); }
        if (!spotifyService.isConnected()) {
          logger.error('Spotify not connected!');
          logger.info('Run: codefi spotify connect');
          process.exit(1);
        }
        logger.info(`🎵 Searching Spotify: ${options.spotify}`);
        await spotifyService.playTrack(options.spotify);
        logger.success('Playing via Spotify!');
        logger.info('Control playback in your Spotify app');
        return;
      }

      // ── YouTube ─────────────────────────────────────────────────────────────
      if (options.youtube) {
        if (!configService.isPro()) { logger.proRequired(); process.exit(1); }
        logger.info('📺 Processing YouTube URL...');
        trackPath   = await youtubeService.downloadAudio(options.youtube);
        const info  = await youtubeService.getVideoInfo(options.youtube);
        trackTitle  = info.title;
        trackArtist = info.artist;
        mood        = (options.mood as MoodType) || 'focus';
        source      = 'youtube';
      }

      // ── Custom URL ──────────────────────────────────────────────────────────
      else if (options.url) {
        if (!configService.isPro()) { logger.proRequired(); process.exit(1); }
        logger.info('🌐 Downloading from URL...');
        trackPath   = await trackDownloader.downloadFromUrl(options.url);
        trackTitle  = 'Custom Track';
        trackArtist = 'Unknown';
        mood        = (options.mood as MoodType) || 'focus';
        source      = 'url';
      }

      // ── Default: local / CDN ────────────────────────────────────────────────
      if (!options.spotify && !options.youtube && !options.url) {
        if (!options.aiMood) {
          mood = ((options.mood || configService.get('defaultMood')) as MoodType) || 'focus';
        }

        const isPro = configService.isPro();

        if (isPro) {
          const playlist = DEFAULT_PLAYLISTS.find((p) => p.mood === mood);
          if (!playlist || playlist.tracks.length === 0) {
            logger.error(`No tracks found for mood: ${mood}`);
            process.exit(1);
          }
          const track = playlist.tracks[0];
          if (track.isPro && !isPro) {
            logger.warning(`"${track.title}" requires CodeFi Pro`);
            logger.info('Upgrade at: https://codefi.dev/pricing');
            process.exit(1);
          }
          trackPath   = await trackDownloader.getTrack(track.filepath);
          trackTitle  = track.title;
          trackArtist = track.artist;
        } else {
          // FIX: use helper that covers all 5 moods
          const track = getFreeTierTrack(mood);
          trackPath   = await trackDownloader.getTrack(track.filepath);
          trackTitle  = track.title;
          trackArtist = track.artist;
        }
        source = 'local';
      }

      if (!fs.existsSync(trackPath)) {
        throw new Error(`Track file not found: ${trackPath}`);
      }

      let currentVolume = options.volume
        ? Math.max(0, Math.min(100, parseInt(options.volume, 10)))
        : (configService.get('defaultVolume') as number) ?? 70;
      let isPaused = false;
      const startedAt = new Date().toISOString();

      // Build playable list for N/P navigation
      let playableTracks: Track[] = [];
      let currentTrackIndex = 0;

      if (!options.spotify && !options.youtube && !options.url) {
        if (configService.isPro()) {
          const pl = DEFAULT_PLAYLISTS.find((p) => p.mood === mood);
          if (pl) { playableTracks = [...pl.tracks]; currentTrackIndex = 0; }
        } else {
          playableTracks = [...FREE_TIER_TRACKS];
          const byMood = FREE_TIER_TRACKS.findIndex((t) => t.mood === mood);
          currentTrackIndex = byMood >= 0 ? byMood : 0;
        }
      }

      // ── Start playback ──────────────────────────────────────────────────────
      console.clear();
      logger.info('🎧 Connecting to Audio Engine...');
      await audioService.play(trackPath, currentVolume);
      logger.success('✓ Connected!');
      logger.newLine();

      // Write state for `status` command
      writeNowPlaying({
        title: trackTitle, artist: trackArtist, mood, volume: currentVolume,
        source, startedAt, isPaused: false,
      });

      visualizer.setTrackInfo(trackTitle, trackArtist);
      visualizer.updateVolume(currentVolume);
      visualizer.start();

      // ── Keyboard controls ───────────────────────────────────────────────────
      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        setTimeout(() => { process.stdin.setRawMode(true); }, 600);
      }

      let isSwitchingTrack = false;

      const playTrackAtIndex = async (index: number) => {
        if (playableTracks.length === 0 || isSwitchingTrack) return;
        const idx = ((index % playableTracks.length) + playableTracks.length) % playableTracks.length;
        const track = playableTracks[idx];
        if (track.isPro && !configService.isPro()) return;

        // Append history for track we're leaving
        if (currentTrackIndex !== idx) {
          appendHistory({
            title: trackTitle, artist: trackArtist, mood, source,
            duration: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
          });
        }

        isSwitchingTrack = true;
        audioService.stop();
        try {
          const p = await trackDownloader.getTrack(track.filepath);
          if (!fs.existsSync(p)) return;
          trackTitle  = track.title;
          trackArtist = track.artist;
          visualizer.setTrackInfo(track.title, track.artist);
          await audioService.play(p, currentVolume);
          currentTrackIndex = idx;
          writeNowPlaying({
            title: track.title, artist: track.artist, mood, volume: currentVolume,
            source, startedAt: new Date().toISOString(), isPaused: false,
          });
        } catch (e) {
          console.error(chalk.red('Failed to load track'), e);
        } finally {
          isSwitchingTrack = false;
        }
      };

      // Sleep timer polling
      const sleepInterval = setInterval(() => {
        if (checkSleepTimer()) {
          clearInterval(sleepInterval);
          quitApp();
        }
      }, 10_000);

      const handleKeypress = (str: string, key: any) => {
        if (!key) return;

        // Quit
        if (key.name === keys.quit || (key.ctrl && key.name === 'c')) {
          clearInterval(sleepInterval);
          quitApp();
          return;
        }

        // Next track
        if (key.name === keys.nextTrack || key.sequence === '\u001b[C') {
          if (playableTracks.length > 0 && !isSwitchingTrack) {
            // Check queue first
            const queued = shiftQueue();
            if (queued) {
              logger.info(`▶  From queue: ${queued.title}`);
            } else {
              playTrackAtIndex((currentTrackIndex + 1) % playableTracks.length);
            }
          }
          return;
        }

        // Previous track
        if (key.name === keys.prevTrack || key.sequence === '\u001b[D') {
          if (playableTracks.length > 0 && !isSwitchingTrack) {
            playTrackAtIndex((currentTrackIndex - 1 + playableTracks.length) % playableTracks.length);
          }
          return;
        }

        // Pause / resume
        if (key.name === keys.pauseResume || key.name === 'space') {
          if (isPaused) {
            audioService.resume();
            visualizer.updateStatus('PLAYING');
            visualizer.start();
            isPaused = false;
          } else {
            audioService.pause();
            visualizer.updateStatus('PAUSED');
            visualizer.stop();
            isPaused = true;
          }
          writeNowPlaying({
            title: trackTitle, artist: trackArtist, mood, volume: currentVolume,
            source, startedAt, isPaused,
          });
          return;
        }

        // Volume up
        if (key.name === 'up' || key.sequence === '\u001b[A' || str === keys.volumeUp) {
          currentVolume = Math.min(currentVolume + 5, 100);
          audioService.setVolume(currentVolume);
          visualizer.updateVolume(currentVolume);
          return;
        }

        // Volume down
        if (key.name === 'down' || key.sequence === '\u001b[B' || str === keys.volumeDown) {
          currentVolume = Math.max(currentVolume - 5, 0);
          audioService.setVolume(currentVolume);
          visualizer.updateVolume(currentVolume);
          return;
        }

        // Mute
        if (key.name === keys.mute) {
          if (currentVolume > 0) {
            configService.set('lastVolume', currentVolume);
            currentVolume = 0;
          } else {
            currentVolume = (configService.get('lastVolume') as number) || 50;
          }
          audioService.setVolume(currentVolume);
          visualizer.updateVolume(currentVolume);
          return;
        }
      };

      process.stdin.on('keypress', handleKeypress);

      const quitApp = () => {
        process.stdin.removeListener('keypress', handleKeypress);
        visualizer.stop();
        audioService.stop();

        // Record to history
        appendHistory({
          title: trackTitle, artist: trackArtist, mood, source,
          duration: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
        });

        clearNowPlaying();

        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        console.clear();
        console.log(chalk.green('\n✓ Happy coding! 💚\n'));
        process.exit(0);
      };

      process.stdin.resume();

    } catch (error: any) {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      logger.error('Playback failed');
      console.error(chalk.red(error?.message ?? String(error)));
      if (error?.message?.includes('Python') || error?.message?.includes('player.py')) {
        console.error(chalk.gray('  Tip: Run "codefi doctor" to check your environment'));
      }
      if (error?.message?.includes('Source track not found')) {
        console.error(chalk.gray('  Tip: Add focus.mp3 and chill.mp3 to apps/cli/assets/tracks'));
      }
      process.exit(1);
    }
  });

export default playCommand;