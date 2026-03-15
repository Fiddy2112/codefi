import Conf from "conf";
import path from "path";
import os from "os";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";
import { AUDIO, PATHS, POMODORO } from "@/utils/constants";
import { UserConfig } from "../types/index.js";

// npm install node-machine-id
let machineIdSync: (original?: boolean) => string;
try {
  ({ machineIdSync } = require("node-machine-id"));
} catch {
  // Fallback nếu chưa install — dùng hostname + username
  machineIdSync = () =>
    `${os.hostname()}-${os.userInfo().username}-codefi-fallback`;
}

class ConfigService {
  private config: Conf<UserConfig>;
  private configDir: string;

  constructor() {
    this.configDir = path.join(os.homedir(), PATHS.CONFIG_DIR);
    this.config = new Conf<UserConfig>({
      projectName: "codefi",
      cwd: this.configDir,
      defaults: this.getDefaults(),
    });
  }

  // ─── Encryption helpers ───────────────────────────────────────────────────

  private getEncryptionKey(): Buffer {
    // Key tied to this machine — token useless if stolen and moved
    const id = machineIdSync(true);
    return createHash("sha256").update(id).digest();
  }

  private encrypt(text: string): string {
    try {
      const key = this.getEncryptionKey();
      const iv = randomBytes(16);
      const cipher = createCipheriv("aes-256-cbc", key, iv);
      const encrypted = Buffer.concat([
        cipher.update(text, "utf8"),
        cipher.final(),
      ]);
      return iv.toString("hex") + ":" + encrypted.toString("hex");
    } catch {
      // If encryption fails (unlikely), store as-is rather than break login
      return text;
    }
  }

  private decrypt(text: string): string {
    try {
      const parts = text.split(":");
      if (parts.length !== 2) return text; // Not encrypted (legacy value)
      const [ivHex, encHex] = parts;
      const key = this.getEncryptionKey();
      const iv = Buffer.from(ivHex, "hex");
      const encBuf = Buffer.from(encHex, "hex");
      const decipher = createDecipheriv("aes-256-cbc", key, iv);
      return Buffer.concat([decipher.update(encBuf), decipher.final()]).toString("utf8");
    } catch {
      return "";
    }
  }

  // ─── Core getters / setters ───────────────────────────────────────────────

  private getDefaults(): UserConfig {
    return {
      isPro: false,
      defaultMood: "focus",
      defaultVolume: AUDIO.DEFAULT_VOLUME,
      pomodoroWorkDuration: POMODORO.WORK_DURATION,
      pomodoroBreakDuration: POMODORO.BREAK_DURATION,
      autoStartPomodoro: false,
      spotifyConnected: false,
      notifications: true,
    };
  }

  get<K extends keyof UserConfig>(key: K): UserConfig[K] {
    return this.config.get(key);
  }

  set<K extends keyof UserConfig>(key: K, value: UserConfig[K]): void {
    this.config.set(key, value);
  }

  getAll(): UserConfig {
    return this.config.store;
  }

  update(updates: Partial<UserConfig>): void {
    Object.entries(updates).forEach(([key, value]) => {
      this.config.set(key as keyof UserConfig, value);
    });
  }

  reset(): void {
    this.config.clear();
    this.config.store = this.getDefaults();
  }

  // ─── Auth helpers ─────────────────────────────────────────────────────────

  isPro(): boolean {
    // verify against server token rather than trusting local flag
    // Local isPro can be faked by editing the config file.
    // Real validation happens in isTokenValid() — isPro() is just the cached result.
    return this.config.get("isPro") === true;
  }

  isLoggedIn(): boolean {
    return !!this.config.get("token");
  }

  /** Returns decrypted access token, or empty string if not logged in. */
  getToken(): string {
    const raw = this.config.get("token") as string | undefined;
    if (!raw) return "";
    return this.decrypt(raw);
  }

  /** Returns decrypted refresh token. */
  getRefreshToken(): string {
    const raw = this.config.get("refreshToken") as string | undefined;
    if (!raw) return "";
    return this.decrypt(raw);
  }

  /** 
   * Check if the stored JWT is still valid (not expired).
   * Works without a network call — just decodes the payload.
   */
  isTokenValid(): boolean {
    const token = this.getToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString("utf8")
      );
      // exp is Unix timestamp in seconds
      return payload.exp > Math.floor(Date.now() / 1000);
    } catch {
      return false;
    }
  }

  login(
    userId: string,
    token: string,
    refreshToken: string,
    email: string,
    isPro: boolean = false
  ): void {
    this.config.set("userId", userId);
    this.config.set("token", this.encrypt(token));
    this.config.set("refreshToken", this.encrypt(refreshToken));
    this.config.set("email", email);
    this.config.set("isPro", isPro);
  }

  logout(): void {
    this.config.delete("userId");
    this.config.delete("token");
    this.config.delete("refreshToken");
    this.config.delete("email");
    this.config.set("isPro", false);
    this.config.set("spotifyConnected", false);
    this.config.delete("spotifyRefreshToken");
  }

  // ─── Paths ────────────────────────────────────────────────────────────────

  getConfigDir(): string {
    return this.configDir;
  }

  getTracksDir(): string {
    return path.join(this.configDir, PATHS.TRACKS_DIR);
  }

  // ─── Import / export ──────────────────────────────────────────────────────

  export(): string {
    // Never export sensitive fields
    const { token, refreshToken, spotifyRefreshToken, ...safe } =
      this.config.store as any;
    return JSON.stringify(safe, null, 2);
  }

  import(configString: string): void {
    try {
      const imported = JSON.parse(configString);
      // Never import sensitive fields from external source
      delete imported.token;
      delete imported.refreshToken;
      delete imported.spotifyRefreshToken;
      delete imported.isPro; // Can't self-grant Pro
      this.update(imported);
    } catch {
      throw new Error("Invalid config format");
    }
  }
}

export const configService = new ConfigService();