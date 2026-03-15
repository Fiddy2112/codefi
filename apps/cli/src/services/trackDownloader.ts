import fs from "fs";
import path from "path";
import https from "https";
import { URL } from "url";
import { logger } from "./logger";
import { getAssetsPath } from "@/utils/paths";

const isDevelopment = process.env.NODE_ENV !== "production";

const LOCAL_TRACKS: Record<string, string> = {
  "midnight-code.mp3":   "focus.mp3",
  "coffee-code.mp3":     "chill.mp3",
  "bug-hunt.mp3":        "focus.mp3",
  "terminal-dreams.mp3": "terminal-dreams.mp3",
  // flow + creative reuse existing assets in development
  "in-the-zone.mp3":     "focus.mp3",
  "innovation-hour.mp3": "chill.mp3",
};

const TRACK_URLS: Record<string, string> = {
  "midnight-code.mp3":   "https://cdn.codefi.dev/tracks/free/midnight-code.mp3",
  "coffee-code.mp3":     "https://cdn.codefi.dev/tracks/free/coffee-code.mp3",
  "bug-hunt.mp3":        "https://cdn.codefi.dev/tracks/free/bug-hunt.mp3",
  "in-the-zone.mp3":     "https://cdn.codefi.dev/tracks/free/in-the-zone.mp3",
  "innovation-hour.mp3": "https://cdn.codefi.dev/tracks/free/innovation-hour.mp3",
};

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

  private sanitizeFilename(filename: string): string {
    const base = path.basename(filename);
    const safe = base.replace(/[^a-zA-Z0-9._\-]/g, "_");
    if (!safe || safe.startsWith(".")) {
      throw new Error(`Invalid track filename: ${filename}`);
    }
    const resolved = path.resolve(this.tracksDir, safe);
    if (!resolved.startsWith(this.tracksDir + path.sep)) {
      throw new Error(`Path traversal detected: ${filename}`);
    }
    return safe;
  }

  async getTrack(filename: string): Promise<string> {
    const safe      = this.sanitizeFilename(filename);
    const localPath = path.join(this.tracksDir, safe);
    if (fs.existsSync(localPath)) return localPath;

    if (isDevelopment) {
      const localTrack = LOCAL_TRACKS[safe];
      if (!localTrack) throw new Error(`Track not available in development: ${safe}`);

      let assetsDir = getAssetsPath("tracks");
      if (!fs.existsSync(assetsDir)) assetsDir = path.join(process.cwd(), "assets", "tracks");

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

    const url = TRACK_URLS[safe];
    if (!url) throw new Error(`Track not available: ${safe}`);

    logger.info(`📥 Downloading ${safe}...`);
    await this.download(url, localPath, { allowedHost: ALLOWED_CDN_HOST });
    logger.success(`✓ Downloaded ${safe}`);
    return localPath;
  }

  async downloadFromUrl(url: string): Promise<string> {
    let parsed: URL;
    try { parsed = new URL(url); }
    catch { throw new Error(`Invalid URL: ${url}`); }

    if (parsed.protocol !== "https:") throw new Error("Only https URLs are allowed");

    const blocked = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
    if (
      blocked.includes(parsed.hostname) ||
      parsed.hostname.endsWith(".local") ||
      /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname)
    ) {
      throw new Error(`Blocked URL (private address): ${parsed.hostname}`);
    }

    const ext = path.extname(parsed.pathname) || ".mp3";
    const allowedExts = new Set([".mp3", ".ogg", ".wav", ".flac", ".m4a"]);
    if (!allowedExts.has(ext.toLowerCase())) {
      throw new Error(`Unsupported audio format: ${ext}`);
    }

    const safeName = `custom-${Date.now()}${ext}`;
    const dest     = path.join(this.tracksDir, safeName);
    await this.download(url, dest);
    return dest;
  }

  // Write to .tmp file, rename to dest atomically on success
  //         → dest is never visible in a partial/corrupt state
  // On redirect, drain the response body and open a fresh WriteStream
  //         → avoids writing to an already-closed stream
  private download(
    url: string,
    dest: string,
    opts: { allowedHost?: string; _redirects?: number } = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((opts._redirects ?? 0) > 3) {
        return reject(new Error("Too many redirects"));
      }

      let parsedUrl: URL;
      try { parsedUrl = new URL(url); }
      catch { return reject(new Error(`Invalid URL: ${url}`)); }

      if (opts.allowedHost && parsedUrl.hostname !== opts.allowedHost) {
        return reject(new Error(
          `Download blocked: expected ${opts.allowedHost}, got ${parsedUrl.hostname}`
        ));
      }

      const tmp  = `${dest}.tmp`;
      const file = fs.createWriteStream(tmp);

      // Single cleanup helper — idempotent
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try { file.close(); }  catch {}
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
      };

      const request = https.get(url, (response) => {
        // Handle redirects
        if ([301, 302, 307, 308].includes(response.statusCode ?? 0)) {
          const location = response.headers.location;
          response.resume(); // drain so socket can be reused
          file.close();
          try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}

          if (!location) {
            return reject(new Error(`Redirect (${response.statusCode}) with no Location header`));
          }
          this.download(location, dest, {
            ...opts,
            _redirects: (opts._redirects ?? 0) + 1,
          }).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          cleanup();
          return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
        }

        const totalBytes = parseInt(response.headers["content-length"] || "0", 10);
        let downloaded   = 0;

        response.on("data", (chunk: Buffer) => {
          downloaded += chunk.length;
          if (totalBytes > 0) {
            const pct = ((downloaded / totalBytes) * 100).toFixed(1);
            process.stdout.write(`\r📥 Downloading... ${pct}%`);
          }
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close(() => {
            process.stdout.write("\r✓ Download complete!     \n");
            try {
              fs.renameSync(tmp, dest); // atomic swap
              resolve();
            } catch (err) {
              cleanup();
              reject(err);
            }
          });
        });

        file.on("error", (err) => { cleanup(); reject(err); });
      });

      request.on("error", (err) => { cleanup(); reject(err); });
      request.setTimeout(60_000, () => {
        request.destroy();
        cleanup();
        reject(new Error("Download timed out after 60s"));
      });
    });
  }

  hasTrack(filename: string): boolean {
    try {
      return fs.existsSync(path.join(this.tracksDir, this.sanitizeFilename(filename)));
    } catch { return false; }
  }

  getTracksDir(): string { return this.tracksDir; }
}

export const trackDownloader = new TrackDownloader();