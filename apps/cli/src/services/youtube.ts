import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { logger } from "./logger";
import { configService } from "./config";
import type { Track } from "../types";

// Allowed YouTube/music hostnames
const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
]);

class YouTubeService {
  private cacheDir: string;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    this.cacheDir = path.join(homeDir, ".codefi", "cache", "youtube");

    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  // validate URL before passing to yt-dlp
  private validateYouTubeUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      throw new Error(
        `URL must be from YouTube (got: ${parsed.hostname}). ` +
          "For other sources use --url flag."
      );
    }

    // Only allow https
    if (parsed.protocol !== "https:") {
      throw new Error("URL must use https");
    }

    return url;
  }

  // Sanitize a string for use as a filename
  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 64);
  }

  async checkDependencies(): Promise<boolean> {
    return new Promise((resolve) => {
      // shell: false
      const check = spawn("yt-dlp", ["--version"], { shell: false });
      check.on("error", () => resolve(false));
      check.on("close", (code) => resolve(code === 0));
    });
  }

  async installDependencies(): Promise<void> {
    logger.info("📦 Installing YouTube downloader (yt-dlp)...");

    const isWindows = process.platform === "win32";
    // split cmd and args properly — never shell: true with user input
    const [cmd, ...args] = isWindows
      ? ["pip", "install", "yt-dlp"]
      : ["pip3", "install", "yt-dlp"];

    logger.info(`Running: ${[cmd, ...args].join(" ")}`);
    logger.info("This may take a minute...");

    return new Promise((resolve, reject) => {
      const install = spawn(cmd, args, {
        shell: false, // shell: false
        stdio: "inherit",
      });

      install.on("error", (err) => reject(err));
      install.on("close", (code) => {
        if (code === 0) {
          logger.success("✓ yt-dlp installed!");
          resolve();
        } else {
          reject(
            new Error(
              "Installation failed. Please install manually: https://github.com/yt-dlp/yt-dlp"
            )
          );
        }
      });
    });
  }

  async getVideoInfo(url: string): Promise<Track> {
    const validUrl = this.validateYouTubeUrl(url); // validate first
    logger.info("🔍 Fetching video info...");

    return new Promise((resolve, reject) => {
      // shell: false — url is passed as a discrete arg, not interpolated
      const ytdlp = spawn(
        "yt-dlp",
        ["--dump-json", "--no-playlist", validUrl],
        { shell: false }
      );

      let output = "";
      let errOutput = "";

      ytdlp.stdout?.on("data", (data) => { output += data.toString(); });
      ytdlp.stderr?.on("data", (data) => { errOutput += data.toString(); });

      ytdlp.on("error", (err) => reject(err));
      ytdlp.on("close", (code) => {
        if (code !== 0) {
          return reject(
            new Error(`Failed to fetch video info: ${errOutput.trim()}`)
          );
        }
        try {
          const info = JSON.parse(output);
          resolve({
            id: info.id,
            title: info.title,
            artist: info.uploader || "YouTube",
            duration: info.duration || 0,
            mood: "focus",
            filepath: "",
            source: "youtube",
            youtubeId: info.id,
            externalUrl: validUrl,
          });
        } catch (error) {
          reject(new Error("Failed to parse video info"));
        }
      });
    });
  }

  async downloadAudio(url: string): Promise<string> {
    if (!configService.isPro()) {
      throw new Error("YouTube integration requires CodeFi Pro");
    }

    const validUrl = this.validateYouTubeUrl(url); // validate first

    const hasYtDlp = await this.checkDependencies();
    if (!hasYtDlp) {
      logger.warning("yt-dlp not found!");
      const answer = await logger.confirm("Install yt-dlp now?"); // now exists
      if (answer) {
        await this.installDependencies();
      } else {
        throw new Error("yt-dlp required for YouTube playback");
      }
    }

    const track = await this.getVideoInfo(validUrl);
    const safeId = this.sanitizeId(track.youtubeId ?? track.id); // sanitize ID

    const cacheFile = path.join(this.cacheDir, `${safeId}.mp3`);
    if (fs.existsSync(cacheFile)) {
      logger.info("✓ Using cached audio");
      return cacheFile;
    }

    logger.info("⬇️  Downloading audio... (this may take a moment)");

    // use %(ext)s template so yt-dlp names the file correctly,
    // then check the expected .mp3 path after conversion
    const outputTemplate = path.join(this.cacheDir, `${safeId}.%(ext)s`);

    return new Promise((resolve, reject) => {
      const ytdlp = spawn(
        "yt-dlp",
        [
          "-x",
          "--audio-format", "mp3",
          "--audio-quality", "0",
          "-o", outputTemplate, // template path
          "--no-playlist",
          validUrl, // validated, passed as discrete arg
        ],
        { shell: false } // shell: false
      );

      ytdlp.stdout?.on("data", (data) => {
        const out = data.toString();
        if (out.includes("Downloading") || out.includes("[download]")) {
          process.stdout.write("\r⬇️  Downloading...");
        }
      });

      ytdlp.stderr?.on("data", (data) => {
        const err = data.toString();
        // yt-dlp sometimes writes progress to stderr
        if (err.includes("[download]")) {
          process.stdout.write("\r⬇️  Downloading...");
        }
      });

      ytdlp.on("error", (err) => reject(err));

      ytdlp.on("close", (code) => {
        process.stdout.write("\r");

        // check the actual output path after conversion
        if (code === 0 && fs.existsSync(cacheFile)) {
          process.stdout.write("✓ Download complete!     \n");
          resolve(cacheFile);
        } else if (code === 0) {
          // yt-dlp exited ok but file not at expected path — scan dir
          const files = fs
            .readdirSync(this.cacheDir)
            .filter((f) => f.startsWith(safeId));

          if (files.length > 0) {
            process.stdout.write("✓ Download complete!     \n");
            resolve(path.join(this.cacheDir, files[0]));
          } else {
            reject(new Error("Download finished but audio file not found"));
          }
        } else {
          // Clean up partial file
          if (fs.existsSync(cacheFile)) {
            try { fs.unlinkSync(cacheFile); } catch {}
          }
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
    });
  }

  clearCache(): void {
    const files = fs.readdirSync(this.cacheDir);
    files.forEach((file) => {
      fs.unlinkSync(path.join(this.cacheDir, file));
    });
    logger.success(`Cleared ${files.length} cached files`);
  }
}

export const youtubeService = new YouTubeService();