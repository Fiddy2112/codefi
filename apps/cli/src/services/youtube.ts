import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { logger } from './logger';
import { configService } from './config';
import type { Track } from '../types';

class YouTubeService {
  private cacheDir: string;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    this.cacheDir = path.join(homeDir, '.codefi', 'cache', 'youtube');
    
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  // Check if yt-dlp is installed
  async checkDependencies(): Promise<boolean> {
    return new Promise((resolve) => {
      const check = spawn('yt-dlp', ['--version'], { shell: true });
      
      check.on('error', () => resolve(false));
      check.on('close', (code) => resolve(code === 0));
    });
  }

  // Install yt-dlp if missing
  async installDependencies(): Promise<void> {
    logger.info('📦 Installing YouTube downloader (yt-dlp)...');
    
    const isWindows = process.platform === 'win32';
    const installCmd = isWindows
      ? 'winget install yt-dlp'
      : 'pip install yt-dlp';
    
    logger.info(`Running: ${installCmd}`);
    logger.info('This may take a minute...');
    
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = installCmd.split(' ');
      const install = spawn(cmd, args, { shell: true, stdio: 'inherit' });
      
      install.on('close', (code) => {
        if (code === 0) {
          logger.success('✓ yt-dlp installed!');
          resolve();
        } else {
          reject(new Error('Installation failed. Please install manually: https://github.com/yt-dlp/yt-dlp'));
        }
      });
    });
  }

  // Extract video info
  async getVideoInfo(url: string): Promise<Track> {
    logger.info('🔍 Fetching video info...');
    
    return new Promise((resolve, reject) => {
      const ytdlp = spawn('yt-dlp', [
        '--dump-json',
        '--no-playlist',
        url
      ], { shell: true });

      let output = '';
      
      ytdlp.stdout?.on('data', (data) => {
        output += data.toString();
      });

      ytdlp.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('Failed to fetch video info'));
          return;
        }

        try {
          const info = JSON.parse(output);
          
          resolve({
            id: info.id,
            title: info.title,
            artist: info.uploader || 'YouTube',
            duration: info.duration || 0,
            mood: 'focus', // Default
            filepath: '', // Will be downloaded
            source: 'youtube',
            youtubeId: info.id,
            externalUrl: url,
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  // Download YouTube audio
  async downloadAudio(url: string): Promise<string> {
    if (!configService.isPro()) {
      throw new Error('YouTube integration requires CodeFi Pro');
    }

    // Check dependencies
    const hasYtDlp = await this.checkDependencies();
    if (!hasYtDlp) {
      logger.warning('yt-dlp not found!');
      const answer = await logger.confirm('Install yt-dlp now?');
      if (answer) {
        await this.installDependencies();
      } else {
        throw new Error('yt-dlp required for YouTube playback');
      }
    }

    // Get video info
    const track = await this.getVideoInfo(url);
    
    // Check cache
    const cacheFile = path.join(this.cacheDir, `${track.youtubeId}.mp3`);
    if (fs.existsSync(cacheFile)) {
      logger.info('✓ Using cached audio');
      return cacheFile;
    }

    // Download
    logger.info('⬇️  Downloading audio... (this may take a moment)');
    
    return new Promise((resolve, reject) => {
      const ytdlp = spawn('yt-dlp', [
        '-x', // Extract audio
        '--audio-format', 'mp3',
        '--audio-quality', '0', // Best quality
        '-o', cacheFile,
        '--no-playlist',
        url
      ], { shell: true });

      ytdlp.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Downloading')) {
          process.stdout.write('\r⬇️  Downloading...');
        }
      });

      ytdlp.on('close', async (code) => {
        if (code === 0) {
          await new Promise(r => setTimeout(r, 100));
          if (fs.existsSync(cacheFile)) {
            process.stdout.write('\r✓ Download complete!     \n');
            resolve(cacheFile);
            return;
          }
        }
        reject(new Error('Download failed'));
      });
    });
  }

  // Clear cache
  clearCache(): void {
    const files = fs.readdirSync(this.cacheDir);
    files.forEach(file => {
      fs.unlinkSync(path.join(this.cacheDir, file));
    });
    logger.success(`Cleared ${files.length} cached files`);
  }
}

export const youtubeService = new YouTubeService();