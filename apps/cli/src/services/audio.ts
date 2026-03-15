import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { EventEmitter } from "events";
import chalk from "chalk";

const PID_FILE = path.join(os.tmpdir(), "codefi-player.pid");

class AudioService extends EventEmitter {
  private pythonProcess: ChildProcess | null = null;
  private isReady = false;

  private getScriptPath(): string | null {
    const candidates = [
      path.resolve(__dirname, "../scripts/player.py"),       // production (dist)
      path.resolve(__dirname, "../../scripts/player.py"),    // development
      path.resolve(process.cwd(), "scripts/player.py"),      // fallback
      path.resolve(process.cwd(), "dist/scripts/player.py"), // absolute fallback
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Try multiple Python commands in order.
   * Windows: py -3 → python → python3
   * Unix:    python3 → python
   */
  private async resolvePythonCommand(): Promise<{
    cmd: string;
    args: string[];
  }> {
    const isWin = process.platform === "win32";
    const candidates: Array<{ cmd: string; args: string[] }> = isWin
      ? [
          { cmd: "py", args: ["-3"] },
          { cmd: "python", args: [] },
          { cmd: "python3", args: [] },
        ]
      : [
          { cmd: "python3", args: [] },
          { cmd: "python", args: [] },
        ];

    for (const candidate of candidates) {
      const found = await this.commandExists(candidate.cmd);
      if (found) return candidate;
    }

    throw new Error(
      "Python 3 not found. Install Python 3 from https://python.org " +
        "then run: pip install pygame"
    );
  }

  private commandExists(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const check = spawn(cmd, ["--version"], {
        shell: false,
        stdio: "ignore",
      });
      check.on("error", () => resolve(false));
      check.on("close", (code) => resolve(code === 0));
    });
  }

  public async play(trackPath: string, volume: number = 50): Promise<void> {
    this.stop();

    return new Promise(async (resolve, reject) => {
      const scriptPath = this.getScriptPath();
      if (!scriptPath) {
        return reject(
          new Error(
            "Missing player.py. Ensure apps/cli/scripts/player.py exists."
          )
        );
      }

      const absoluteTrackPath = path.resolve(trackPath);
      if (!fs.existsSync(absoluteTrackPath)) {
        return reject(new Error(`Audio file not found: ${absoluteTrackPath}`));
      }

      let pythonCmd: { cmd: string; args: string[] };
      try {
        pythonCmd = await this.resolvePythonCommand(); // probe before spawning
      } catch (err: any) {
        return reject(err);
      }

      const allArgs = [
        ...pythonCmd.args,
        scriptPath,
        absoluteTrackPath,
        volume.toString(),
      ];

      this.pythonProcess = spawn(pythonCmd.cmd, allArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        detached: false,
        env: { ...process.env, PYGAME_HIDE_SUPPORT_PROMPT: "1" },
      });

      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve();
      };

      this.pythonProcess.on("error", (err: NodeJS.ErrnoException) => {
        const msg =
          err.code === "ENOENT"
            ? `Python not found (tried: ${pythonCmd.cmd}). Install Python 3 and run: pip install pygame`
            : err.message;
        finish(new Error(`Audio engine: ${msg}`));
      });

      if (this.pythonProcess.pid) {
        try {
          fs.writeFileSync(PID_FILE, this.pythonProcess.pid.toString());
        } catch {}
      }

      this.pythonProcess.stdout?.on("data", (data) => {
        const output = data.toString();
        if (output.includes("READY:")) {
          this.isReady = true;
          finish();
        }
      });

      this.pythonProcess.stderr?.on("data", (d) => {
        const err = d.toString();
        // Suppress pygame's noisy startup output
        if (!err.includes("pygame") && !err.includes("Hello from")) {
          console.error(chalk.red(`[Audio Engine]: ${err.trim()}`));
        }
      });

      this.pythonProcess.on("close", (code, signal) => {
        this.isReady = false;
        this.cleanupPidFile();
        this.emit("stop");

        if (!settled) {
          const hint =
            code !== 0
              ? `Player exited (code ${code}). Is pygame installed? Run: pip install pygame`
              : "Audio stopped before ready. Check track file and pygame installation.";
          finish(new Error(hint));
        }
      });
    });
  }

  public setVolume(vol: number): void {
    this.send(`VOL:${Math.max(0, Math.min(100, vol))}`);
  }

  public pause(): void {
    this.send("PAUSE");
  }

  public resume(): void {
    this.send("RESUME");
  }

  public stop(): void {
    this.send("STOP");
    if (this.pythonProcess) {
      try { this.pythonProcess.kill("SIGTERM"); } catch {}
      this.pythonProcess = null;
    }
    this.isReady = false;
    this.cleanupPidFile();
  }

  public isPlaying(): boolean {
    return this.isReady && this.pythonProcess !== null;
  }

  public setMood(_mood: string): void {
    // Mood affects which track is loaded, handled by play command.
    // This is a no-op at the audio layer — kept for API compatibility.
  }

  private send(cmd: string): void {
    if (this.pythonProcess?.stdin && !this.pythonProcess.killed) {
      try {
        this.pythonProcess.stdin.write(cmd + "\n");
      } catch {
        // Swallow EPIPE — process already dead
      }
    }
  }

  private cleanupPidFile(): void {
    if (fs.existsSync(PID_FILE)) {
      try { fs.unlinkSync(PID_FILE); } catch {}
    }
  }
}

export const audioService = new AudioService();