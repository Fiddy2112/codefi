import fs from "fs";
import path from "path";
import https from "https";
import { URL } from "url";
import { logger } from "./logger";

const isDevelopment = process.env.NODE_ENV !== "production";

const LOCAL_TRACKS: Record<string, string> = {
  "midnight-code.mp3": "focus.mp3",
  "coffee-code.mp3": "chill.mp3",
  "bug-hunt.mp3": "focus.mp3",
  "terminal-dreams.mp3": "terminal-dreams.mp3",
  "in-the-zone.mp3": "focus.mp3",
  "innovation-hour.mp3": "chill.mp3",
};

const TRACK_URLS: Record<string, string> = {
  "midnight-code.mp3": "https://cdn.codefi.dev/tracks/free/midnight-code.mp3",
  "coffee-code.mp3": "https://cdn.codefi.dev/tracks/free/coffee-code.mp3",
  "bug-hunt.mp3": "https://cdn.codefi.dev/tracks/free/bug-hunt.mp3",
};

// Allowed CDN hostname — only download from our own CDN
const ALLOWED_CDN_HOST = "cdn.codefi.dev";

export class TrackDownloader {
  private tracksDir: string;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    this.tracksDir = path.join(homeDir, ".codefi", "tracks");

    if (!fs.existsSync(this.tracksDir)) {
      fs.mkdirSync(this.tracksDir, { recursive: true });
    }
  }

  // sanitize filename to prevent path traversal (../../etc/passwd)
  private sanitizeFilename(filename: string): string {
    // Strip any directory components, only allow safe chars
    const base = path.basename(filename);
    const safe = base.replace(/[^a-zA-Z0-9._\-]/g, "_");

    if (!safe || safe.startsWith(".")) {
      throw new Error(`Invalid track filename: ${filename}`);
    }

    // Resolve and verify the final path stays inside tracksDir
    const resolved = path.resolve(this.tracksDir, safe);
    if (!resolved.startsWith(this.tracksDir + path.sep)) {
      throw new Error(`Path traversal detected: ${filename}`);
    }

    return safe;
  }

  async getTrack(filename: string): Promise<string> {
    const safe = this.sanitizeFilename(filename); // sanitize
    const localPath = path.join(this.tracksDir, safe);

    if (fs.existsSync(localPath)) {
      return localPath;
    }

    if (isDevelopment) {
      const localTrack = LOCAL_TRACKS[safe];
      if (!localTrack) {
        throw new Error(`Track not available in development: ${safe}`);
      }

      let assetsDir = path.join(__dirname, "../../assets/tracks");
      if (!fs.existsSync(assetsDir)) {
        assetsDir = path.join(process.cwd(), "assets", "tracks");
      }

      const sourcePath = path.join(assetsDir, localTrack);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(
          `Source track not found: ${sourcePath}. ` +
            "Add focus.mp3 and chill.mp3 to apps/cli/assets/tracks."
        );
      }

      logger.info(`📁 Using local track: ${localTrack} → ${safe}`);
      fs.copyFileSync(sourcePath, localPath);
      logger.success(`✓ Track ready: ${safe}`);
      return localPath;
    }

    // Production: only download from our CDN
    const url = TRACK_URLS[safe];
    if (!url) {
      throw new Error(`Track not available: ${safe}`);
    }

    logger.info(`📥 Downloading ${safe}...`);
    await this.download(url, localPath, { allowedHost: ALLOWED_CDN_HOST });
    logger.success(`✓ Downloaded ${safe}`);
    return localPath;
  }

  // validate URL host before downloading — prevents SSRF
  async downloadFromUrl(url: string): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    if (parsed.protocol !== "https:") {
      throw new Error("Only https URLs are allowed");
    }

    // Block private/local addresses
    const blocked = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
    if (
      blocked.includes(parsed.hostname) ||
      parsed.hostname.endsWith(".local") ||
      parsed.hostname.startsWith("192.168.") ||
      parsed.hostname.startsWith("10.") ||
      parsed.hostname.startsWith("172.")
    ) {
      throw new Error(`Blocked URL (private address): ${parsed.hostname}`);
    }

    const ext = path.extname(parsed.pathname) || ".mp3";
    // Only allow audio file extensions
    const allowedExts = new Set([".mp3", ".ogg", ".wav", ".flac", ".m4a"]);
    if (!allowedExts.has(ext.toLowerCase())) {
      throw new Error(`Unsupported audio format: ${ext}`);
    }

    const safeName = `custom-${Date.now()}${ext}`;
    const dest = path.join(this.tracksDir, safeName);
    await this.download(url, dest);
    return dest;
  }

  private download(
    url: string,
    dest: string,
    opts: { allowedHost?: string } = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // verify host before starting download
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return reject(new Error(`Invalid URL: ${url}`));
      }

      if (opts.allowedHost && parsedUrl.hostname !== opts.allowedHost) {
        return reject(
          new Error(
            `Download blocked: expected ${opts.allowedHost}, got ${parsedUrl.hostname}`
          )
        );
      }

      const file = fs.createWriteStream(dest);

      const request = https.get(url, (response) => {
        // Follow one redirect max (CDN signed URLs etc.)
        if (
          response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 307
        ) {
          const location = response.headers.location;
          if (location) {
            file.close();
            this.download(location, dest, opts).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          return reject(
            new Error(`Download failed: HTTP ${response.statusCode}`)
          );
        }

        const totalBytes = parseInt(
          response.headers["content-length"] || "0"
        );
        let downloadedBytes = 0;

        response.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const progress = ((downloadedBytes / totalBytes) * 100).toFixed(1);
            process.stdout.write(`\r📥 Downloading... ${progress}%`);
          }
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          process.stdout.write("\r✓ Download complete!     \n");
          resolve();
        });
      });

      request.on("error", (err) => {
        file.close();
        if (fs.existsSync(dest)) {
          try { fs.unlinkSync(dest); } catch {}
        }
        reject(err);
      });

      // Timeout after 60 seconds
      request.setTimeout(60_000, () => {
        request.destroy();
        if (fs.existsSync(dest)) {
          try { fs.unlinkSync(dest); } catch {}
        }
        reject(new Error("Download timed out after 60s"));
      });
    });
  }

  hasTrack(filename: string): boolean {
    try {
      const safe = this.sanitizeFilename(filename);
      return fs.existsSync(path.join(this.tracksDir, safe));
    } catch {
      return false;
    }
  }

  getTracksDir(): string {
    return this.tracksDir;
  }
}

export const trackDownloader = new TrackDownloader();