import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import chalk from 'chalk';
import { configService } from '../services/config';
import { trackDownloader } from '../services/trackDownloader';
import { spotifyService } from '../services/spotify';
import { youtubeService } from '../services/youtube';
import { aiService } from '@/services/ai';
import { audioService } from '../services/audio';
import { logger } from '../services/logger';
import { visualizer } from '../ui/visualizer';
import { DEFAULT_PLAYLISTS, FREE_TIER_TRACKS } from '../utils/constants';
import type { MoodType, Track } from '../types';

export const playCommand = new Command('play')
  .description('Start playing music')
  .option('-m, --mood <mood>', 'Select mood (focus, chill, debug, flow, creative)')
  .option('-v, --volume <number>', 'Set volume (0-100)')
  .option('--spotify <query>', 'Play from Spotify (Pro)')
  .option('--youtube <url>', 'Play from YouTube (Pro)')
  .option('--url <url>', 'Play from custom URL (Pro)')
  .option('--ai-mood', 'Auto-detect mood with AI (Pro)')
  .action(async (options) => {
    try {
      let trackPath!: string;
      let trackTitle!: string;
      let trackArtist!: string;
      let mood!: MoodType;

      // === AI MOOD DETECTION (sets mood only; track chosen in default block) ===
      if (options.aiMood) {
        if (!configService.isPro()) {
          logger.proRequired();
          process.exit(1);
        }

        const aiResult = await aiService.detectMood();
        logger.success(`🤖 AI detected mood: ${aiResult.mood} (${(aiResult.confidence * 100).toFixed(0)}% confidence)`);
        logger.info(`💡 ${aiResult.reason}`);
        logger.newLine();

        mood = aiResult.mood;
      }

      // === SPOTIFY ===
      if (options.spotify) {
        if (!configService.isPro()) {
          logger.proRequired();
          process.exit(1);
        }

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
      // === YOUTUBE ===
      else if (options.youtube) {
        if (!configService.isPro()) {
          logger.proRequired();
          process.exit(1);
        }

        logger.info('📺 Processing YouTube URL...');
        trackPath = await youtubeService.downloadAudio(options.youtube);
        
        const track = await youtubeService.getVideoInfo(options.youtube);
        trackTitle = track.title;
        trackArtist = track.artist;
        mood = options.mood as MoodType || 'focus';
      }
      // === CUSTOM URL ===
      else if (options.url) {
        if (!configService.isPro()) {
          logger.proRequired();
          process.exit(1);
        }

        logger.info('🌐 Downloading from URL...');
        trackPath = await trackDownloader.downloadFromUrl(options.url);
        trackTitle = 'Custom Track';
        trackArtist = 'Unknown';
        mood = options.mood as MoodType || 'focus';
      }
      // === DEFAULT: LOCAL/CDN (also when --ai-mood was used) ===
      if (!options.spotify && !options.youtube && !options.url) {
        if (!options.aiMood) {
          mood = (options.mood || configService.get('defaultMood')) as MoodType;
        }
        const isPro = configService.isPro();

        if (isPro) {
          // Pro: full playlist per mood (more tracks, can include Pro-only)
          const playlist = DEFAULT_PLAYLISTS.find(p => p.mood === mood);
          if (!playlist || playlist.tracks.length === 0) {
            logger.error(`No tracks found for mood: ${mood}`);
            process.exit(1);
          }
          const track = playlist.tracks[0];
          if (track.isPro) {
            logger.warning(`"${track.title}" requires CodeFi Pro`);
            logger.info('Upgrade at: https://codefi.dev/pricing');
            process.exit(1);
          }
          trackPath = await trackDownloader.getTrack(track.filepath);
          trackTitle = track.title;
          trackArtist = track.artist;
        } else {
          // Free: always the same 3 tracks; mood picks which one starts first
          const moodIndex = FREE_TIER_TRACKS.findIndex(t => t.mood === mood);
          const startIndex = moodIndex >= 0 ? moodIndex : 0;
          const track = FREE_TIER_TRACKS[startIndex];
          trackPath = await trackDownloader.getTrack(track.filepath);
          trackTitle = track.title;
          trackArtist = track.artist;
        }
      }

      // Verify file exists
      if (!fs.existsSync(trackPath)) {
        throw new Error(`Track file not found: ${trackPath}`);
      }

      let currentVolume = options.volume ? parseInt(options.volume) : 50;
      let isPaused = false;

      // Next/previous only in default (mood) mode. Free = 3 tracks; Pro = full playlist per mood.
      let playableTracks: Track[] = [];
      let currentTrackIndex = 0;
      if (!options.spotify && !options.youtube && !options.url) {
        if (configService.isPro()) {
          const playlist = DEFAULT_PLAYLISTS.find(p => p.mood === mood);
          if (playlist) {
            playableTracks = [...playlist.tracks];
            currentTrackIndex = 0;
          }
        } else {
          playableTracks = [...FREE_TIER_TRACKS];
          const byMood = FREE_TIER_TRACKS.findIndex(t => t.mood === mood);
          currentTrackIndex = byMood >= 0 ? byMood : 0;
        }
      }

      // Start playback
      console.clear();
      logger.info('🎧 Connecting to Audio Engine...');
      
      await audioService.play(trackPath, currentVolume);
      
      logger.success('✓ Connected!');
      logger.newLine();

      // Start visualizer
      visualizer.setTrackInfo(trackTitle, trackArtist);
      visualizer.updateVolume(currentVolume);
      visualizer.start();

      // Keyboard controls
      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        setTimeout(() => {
          process.stdin.setRawMode(true);
        }, 600);
      }

      let isSwitchingTrack = false; // prevent key-repeat / double N from skipping tracks

      const playTrackAtIndex = async (index: number) => {
        if (playableTracks.length === 0) return;
        if (isSwitchingTrack) return;
        const idx = ((index % playableTracks.length) + playableTracks.length) % playableTracks.length;
        const track = playableTracks[idx];
        if (track.isPro && !configService.isPro()) return;
        isSwitchingTrack = true;
        audioService.stop();
        try {
          const path = await trackDownloader.getTrack(track.filepath);
          if (!fs.existsSync(path)) return;
          visualizer.setTrackInfo(track.title, track.artist);
          await audioService.play(path, currentVolume);
          currentTrackIndex = idx; // only after playback started (avoids wrong index on failure)
        } catch (e) {
          console.error(chalk.red('Failed to load next track'), e);
        } finally {
          isSwitchingTrack = false;
        }
      };

      const handleKeypress = (str: string, key: any) => {
        if (!key) return;

        // Quit
        if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
          quitApp();
          return;
        }

        // Next track (ignore while switching to avoid key-repeat skipping 2+ tracks)
        if (key.name === 'n' || key.sequence === '\u001b[C') {
          if (playableTracks.length > 0 && !isSwitchingTrack) {
            const nextIndex = (currentTrackIndex + 1) % playableTracks.length;
            playTrackAtIndex(nextIndex);
            console.log(chalk.gray(`Next: ${playableTracks[nextIndex]?.title ?? ''}`));
          }
          return;
        }

        // Previous track
        if (key.name === 'p' || key.sequence === '\u001b[D') {
          if (playableTracks.length > 0 && !isSwitchingTrack) {
            const prevIndex = (currentTrackIndex - 1 + playableTracks.length) % playableTracks.length;
            playTrackAtIndex(prevIndex);
            console.log(chalk.gray(`Previous: ${playableTracks[prevIndex]?.title ?? ''}`));
          }
          return;
        }

        // Pause/Resume
        if (key.name === 'space' || key.name === 's') {
          if (isPaused) {
            audioService.resume();
            visualizer.start();
            isPaused = false;
          } else {
            audioService.pause();
            visualizer.stop();
            isPaused = true;
          }
          return;
        }

        // Volume up - handle Windows arrow keys + alternatives
        if (key.name === 'up' || key.sequence === '\u001b[A' || str === 'k') {
          currentVolume = Math.min(currentVolume + 5, 100);
          audioService.setVolume(currentVolume);
          visualizer.updateVolume(currentVolume);
          console.log(`Volume UP to: ${currentVolume}%`);
          return;
        }

        // Volume down - handle Windows arrow keys + alternatives
        if (key.name === 'down' || key.sequence === '\u001b[B' || str === 'j') {
          currentVolume = Math.max(currentVolume - 5, 0);
          audioService.setVolume(currentVolume);
          visualizer.updateVolume(currentVolume);
          console.log(`Volume DOWN to: ${currentVolume}%`);
          return;
        }

        // Mute
        if (key.name === 'm') {
          if (currentVolume > 0) {
            configService.set('lastVolume', currentVolume);
            currentVolume = 0;
          } else {
            currentVolume = configService.get('lastVolume') || 50;
          }
          audioService.setVolume(currentVolume);
          visualizer.updateVolume(currentVolume);
          console.log(`Volume set to: ${currentVolume}%`);
          return;
        }
      };

      process.stdin.on('keypress', handleKeypress);

      const quitApp = () => {
        process.stdin.removeListener('keypress', handleKeypress);
        visualizer.stop();
        audioService.stop();
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        console.clear();
        console.log(chalk.green('\n✓ Happy coding! 💚\n'));
        process.exit(0);
      };

      process.stdin.resume();

    } catch (error: any) {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      logger.error('Playback failed');
      console.error(chalk.red(error?.message ?? String(error)));
      if (error?.message?.includes('Python') || error?.message?.includes('player.py')) {
        console.error(chalk.gray('  Tip: Install Python 3 and run: pip install pygame'));
      }
      if (error?.message?.includes('Source track not found')) {
        console.error(chalk.gray('  Tip: Add focus.mp3 and chill.mp3 to apps/cli/assets/tracks'));
      }
      process.exit(1);
    }
  });

export default playCommand;