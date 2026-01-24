import { audioService } from "@/services/audio";
import { configService } from "@/services/config";
import { logger } from "@/services/logger";
import { DEFAULT_PLAYLISTS, MOODS } from "@/utils/constants";
import { Command } from "commander";
import type { MoodType } from "@/types";

export const playCommand = new Command('play')
  .description('Start playing music')
  .option('-m, --mood <mood>', 'Select mood (focus, chill, debug, flow, creative)')
  .option('-v, --volume <number>', 'Set volume (0-100)')
  .option('-r, --repeat', 'Enable repeat mode')
  .option('-s, --shuffle', 'Enable shuffle mode')
  .action(async (options) => {
    try {
      logger.welcome();
      logger.newLine();

      // Get mood from options or config
      const mood = (options.mood || configService.get('defaultMood')) as MoodType;

      // Validate mood
      if (!Object.keys(MOODS).includes(mood)) {
        logger.error(`Invalid mood: ${mood}`);
        logger.info(`Available moods: ${Object.keys(MOODS).join(', ')}`);
        process.exit(1);
      }

      // Set mood
      audioService.setMood(mood);
      const moodConfig = MOODS[mood];
      
      logger.info(`Mood: ${moodConfig.emoji} ${moodConfig.name}`);
      logger.info(`Description: ${moodConfig.description}`);
      logger.newLine();

      // Set volume if provided
      if (options.volume) {
        audioService.setVolume(parseInt(options.volume));
      }

      // Set repeat/shuffle
      if (options.repeat) {
        audioService.toggleRepeat();
      }
      if (options.shuffle) {
        audioService.toggleShuffle();
      }

      // Find playlist for mood
      const playlist = DEFAULT_PLAYLISTS.find(p => p.mood === mood);
      
      if (!playlist || playlist.tracks.length === 0) {
        logger.warning(`No tracks available for mood: ${mood}`);
        logger.info('Try a different mood or upgrade to Pro for more tracks');
        process.exit(1);
      }

      // Select first track (in future: handle shuffle)
      const track = playlist.tracks[0];

      // Start playing
      const spinner = logger.spinner('Loading track...');
      spinner.start();

      // Simulate loading (in real app, this would load the actual audio file)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      spinner.succeed('Track loaded');
      logger.newLine();

      // In a real implementation, this would play the actual audio
      // For now, we'll just show the UI
      logger.flowActivated();
      
      // Mock playback (no actual audio)
      try {
        await audioService.play(track);
      } catch (error) {
        logger.warning('Audio playback not available in demo mode');
      }

      logger.newLine();
      logger.divider();
      logger.info('✨ Demo Mode - Simulating playback');
      logger.info('Press Ctrl+C to stop');
      logger.divider();

      // Keep the process alive
      process.stdin.resume();

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        logger.newLine();
        logger.newLine();
        audioService.stop();
        logger.success('Thanks for using CodeFi!');
        process.exit(0);
      });

    } catch (error) {
      logger.error('Failed to start playback', error as Error);
      process.exit(1);
    }
  });

export default playCommand;