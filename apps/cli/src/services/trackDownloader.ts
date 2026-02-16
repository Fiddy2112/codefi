import fs from 'fs';
import path from 'path';
import https from 'https';
import { logger } from './logger';

// Development: Use local tracks from assets directory
const isDevelopment = process.env.NODE_ENV !== 'production';

// Local track mapping for development
const LOCAL_TRACKS: Record<string, string> = {
  'midnight-code.mp3': 'focus.mp3',
  'coffee-code.mp3': 'chill.mp3',
  'bug-hunt.mp3': 'focus.mp3', // Reuse focus.mp3 for demo
  'terminal-dreams.mp3': 'terminal-dreams.mp3',
  'in-the-zone.mp3': 'focus.mp3', // Reuse focus.mp3 for demo
  'innovation-hour.mp3': 'chill.mp3', // Reuse chill.mp3 for demo
};

// CDN URLs cho free tracks (production)
const TRACK_URLS: Record<string, string> = {
  'midnight-code.mp3': 'https://cdn.codefi.dev/tracks/free/midnight-code.mp3',
  'coffee-code.mp3': 'https://cdn.codefi.dev/tracks/free/coffee-code.mp3',
  'bug-hunt.mp3': 'https://cdn.codefi.dev/tracks/free/bug-hunt.mp3',
  // ... more tracks
};

export class TrackDownloader {
  private tracksDir: string;

  constructor() {
    // User's home directory: ~/.codefi/tracks
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    this.tracksDir = path.join(homeDir, '.codefi', 'tracks');
    
    // Create directory if not exists
    if (!fs.existsSync(this.tracksDir)) {
      fs.mkdirSync(this.tracksDir, { recursive: true });
    }
  }

  // Get local track path (download if not exists)
  async getTrack(filename: string): Promise<string> {
    const localPath = path.join(this.tracksDir, filename);
    
    // Already downloaded
    if (fs.existsSync(localPath)) {
      return localPath;
    }

    // Development: Copy from local assets
    if (isDevelopment) {
      const localTrack = LOCAL_TRACKS[filename];
      if (!localTrack) {
        throw new Error(`Track not available in development: ${filename}`);
      }

      // Get the assets directory path - try production first, then development
      let assetsDir = path.join(__dirname, '../../assets/tracks'); // Production (in dist)
      
      // Fallback to development
      if (!fs.existsSync(assetsDir)) {
        assetsDir = path.join(process.cwd(), 'assets', 'tracks'); // Development
      }
      const sourcePath = path.join(assetsDir, localTrack);
      
      if (!fs.existsSync(sourcePath)) {
        throw new Error(
          `Source track not found: ${sourcePath}. ` +
          'For local dev, add focus.mp3 and chill.mp3 to apps/cli/assets/tracks (or run from production with CDN).'
        );
      }

      logger.info(`📁 Using local track: ${localTrack} -> ${filename}`);
      fs.copyFileSync(sourcePath, localPath);
      logger.success(`✓ Track copied: ${filename}`);
      
      return localPath;
    }

    // Production: Download from CDN
    const url = TRACK_URLS[filename];
    if (!url) {
      throw new Error(`Track not available: ${filename}`);
    }

    logger.info(`📥 Downloading ${filename}...`);
    await this.download(url, localPath);
    logger.success(`✓ Downloaded ${filename}`);
    
    return localPath;
  }

  // Download from arbitrary URL and return local path (for --url in play)
  async downloadFromUrl(url: string): Promise<string> {
    const ext = path.extname(new URL(url).pathname) || '.mp3';
    const safeName = `custom-${Date.now()}${ext}`;
    const dest = path.join(this.tracksDir, safeName);
    await this.download(url, dest);
    return dest;
  }

  // Download file from URL
  private download(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: ${response.statusCode}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0');
        let downloadedBytes = 0;

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const progress = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          process.stdout.write(`\r📥 Downloading... ${progress}%`);
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          process.stdout.write('\r✓ Download complete!     \n');
          resolve();
        });
      }).on('error', (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
    });
  }

  // Check if track exists locally
  hasTrack(filename: string): boolean {
    return fs.existsSync(path.join(this.tracksDir, filename));
  }

  // Get tracks directory
  getTracksDir(): string {
    return this.tracksDir;
  }
}

export const trackDownloader = new TrackDownloader();