import { spawn } from "child_process";
import http from "http";
import { URL } from "url";
import crypto from "crypto";
import { configService } from "./config";
import { logger } from "./logger";
import type { Track, Playlist } from "../types";

const SPOTIFY_PORT = 8888;
const SPOTIFY_REDIRECT = `http://localhost:${SPOTIFY_PORT}/callback`;
const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
  "streaming",
].join(" ");

class SpotifyService {
  private clientId = process.env.SPOTIFY_CLIENT_ID || "";
  private clientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";

  isConnected(): boolean {
    return !!configService.get("spotifyRefreshToken");
  }

  // Full OAuth callback server — no more placeholder
  async connect(): Promise<void> {
    if (!configService.isPro()) {
      throw new Error("Spotify integration requires CodeFi Pro");
    }

    if (!this.clientId) {
      throw new Error(
        "SPOTIFY_CLIENT_ID not set. Add it to your .env file.\n" +
          "Create an app at: https://developer.spotify.com/dashboard"
      );
    }

    const state = crypto.randomBytes(16).toString("hex"); // CSRF

    const authUrl = new URL("https://accounts.spotify.com/authorize");
    authUrl.searchParams.set("client_id", this.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", SPOTIFY_REDIRECT);
    authUrl.searchParams.set("scope", SPOTIFY_SCOPES);
    authUrl.searchParams.set("state", state);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close();
        reject(new Error("Spotify auth timed out (2 minutes)"));
      }, 2 * 60 * 1000);

      const server = http.createServer(async (req, res) => {
        if (!req.url) return;
        const url = new URL(req.url, `http://localhost:${SPOTIFY_PORT}`);
        if (url.pathname !== "/callback") return;

        // CSRF check
        if (url.searchParams.get("state") !== state) {
          res.writeHead(400);
          res.end("Invalid state");
          clearTimeout(timeout);
          server.close();
          return reject(new Error("State mismatch — possible CSRF"));
        }

        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(this.buildPage("Authorization failed", error, false));
          clearTimeout(timeout);
          server.close();
          return reject(new Error(`Spotify auth denied: ${error}`));
        }

        const code = url.searchParams.get("code");
        if (!code) return;

        try {
          const tokens = await this.exchangeCode(code);

          // Store tokens (configService encrypts them)
          configService.set(
            "spotifyRefreshToken" as any,
            tokens.refresh_token
          );
          configService.set("spotifyConnected", true);

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            this.buildPage(
              "Spotify connected!",
              "You can close this tab and return to your terminal.",
              true
            )
          );

          clearTimeout(timeout);
          server.close();
          logger.success("✓ Spotify connected!");
          resolve();
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(this.buildPage("Connection failed", err.message, false));
          clearTimeout(timeout);
          server.close();
          reject(err);
        }
      });

      server.listen(SPOTIFY_PORT, async () => {
        logger.info("🎵 Opening Spotify authorization in browser...");
        logger.info(
          chalk(`   If browser didn't open: ${authUrl.toString()}`)
        );
        await this.openBrowser(authUrl.toString());
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        if (err.code === "EADDRINUSE") {
          reject(
            new Error(
              `Port ${SPOTIFY_PORT} is busy. Close any other process using it and retry.`
            )
          );
        } else {
          reject(err);
        }
      });
    });
  }

  private async exchangeCode(
    code: string
  ): Promise<{ access_token: string; refresh_token: string }> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT,
    });

    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString("base64");

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<{
      access_token: string;
      refresh_token: string;
    }>;
  }

  private async getAccessToken(): Promise<string> {
    const refreshToken = configService.get("spotifyRefreshToken") as
      | string
      | undefined;
    if (!refreshToken) throw new Error("Spotify not connected");

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString("base64");

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh Spotify token: ${response.status}`);
    }

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }

  async searchPlaylists(query: string): Promise<Playlist[]> {
    if (!this.isConnected()) {
      throw new Error("Spotify not connected. Run: codefi spotify connect");
    }

    logger.info(`🔍 Searching Spotify for: ${query}`);
    const token = await this.getAccessToken();

    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "playlist");
    url.searchParams.set("limit", "5");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Spotify search failed: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return (data.playlists?.items ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      mood: "focus" as const,
      source: "spotify" as const,
      tracks: [],
    }));
  }

  async playTrack(query: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error("Spotify not connected");
    }

    // If it looks like a Spotify URI or ID, open directly; else search
    const isUri = query.startsWith("spotify:") || /^[a-zA-Z0-9]{22}$/.test(query);
    const spotifyUrl = isUri
      ? `spotify:track:${query.replace("spotify:track:", "")}`
      : `https://open.spotify.com/search/${encodeURIComponent(query)}`;

    logger.info("▶️  Opening in Spotify app...");
    await this.openBrowser(spotifyUrl);
    logger.info("Control playback in your Spotify app");
  }

  disconnect(): void {
    configService.set("spotifyRefreshToken" as any, undefined);
    configService.set("spotifyConnected", false);
    logger.success("Spotify disconnected");
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async openBrowser(url: string): Promise<void> {
    const platform = process.platform;
    const [cmd, ...args] =
      platform === "win32"
        ? ["cmd", "/c", "start", url]
        : platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];

    // shell: false — url is a discrete arg
    spawn(cmd, args, { shell: false, detached: true, stdio: "ignore" }).unref();
  }

  private buildPage(title: string, message: string, success: boolean): string {
    const color = success ? "#00FF41" : "#ff4444";
    return `<!DOCTYPE html>
<html>
<head><title>${title}</title></head>
<body style="background:#0E1117;color:${color};font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px">
  <div style="font-size:48px">${success ? "✓" : "✗"}</div>
  <div style="font-size:20px;font-weight:bold">${title}</div>
  <div style="color:#888;font-size:14px">${message}</div>
  ${success ? "<script>setTimeout(()=>window.close(),2000)</script>" : ""}
</body>
</html>`;
  }
}

function chalk(s: string): string {
  return s; // thin shim so the file compiles without importing chalk
}

export const spotifyService = new SpotifyService();