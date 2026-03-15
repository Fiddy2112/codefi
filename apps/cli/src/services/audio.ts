import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { EventEmitter } from "events";
import chalk from "chalk";
import { getInternalScriptPath } from "@/utils/paths";

const PID_FILE = path.join(os.tmpdir(), "codefi-player.pid");

class AudioService extends EventEmitter {
  private pythonProcess: ChildProcess | null = null;
  private isReady = false;

  private getScriptPath(): string | null {
    const candidates = [
      getInternalScriptPath("player.py"),
      path.resolve(process.cwd(), "scripts/player.py"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  // Separate from stop() — no double cleanupPidFile race
  private killZombieProcess(): void {
    try {
      if (!fs.existsSync(PID_FILE)) return;
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
      if (!isNaN(pid)) {
        process.kill(pid, 0);        // throws if not alive
        process.kill(pid, "SIGTERM");
      }
    } catch {
      // Not alive or no permission — fine
    }
    // Always clean the file here (stop() has its own cleanupPidFile for the new process)
    try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch {}
  }

  private async resolvePythonCommand(): Promise<{ cmd: string; args: string[] }> {
    const isWin = process.platform === "win32";
    const candidates: Array<{ cmd: string; args: string[] }> = isWin
      ? [{ cmd: "py", args: ["-3"] }, { cmd: "python", args: [] }, { cmd: "python3", args: [] }]
      : [{ cmd: "python3", args: [] }, { cmd: "python", args: [] }];

    for (const candidate of candidates) {
      if (await this.commandExists(candidate.cmd)) return candidate;
    }
    throw new Error(
      "Python 3 not found. Install Python 3 from https://python.org then run: pip install pygame"
    );
  }

  private commandExists(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const check = spawn(cmd, ["--version"], { shell: false, stdio: "ignore" });
      check.on("error", () => resolve(false));
      check.on("close", (code) => resolve(code === 0));
    });
  }

  // Async preconditions resolved BEFORE entering Promise constructor
  // Avoids the async-in-Promise-constructor antipattern where thrown errors
  // before the first await are swallowed silently.
  public async play(trackPath: string, volume: number = 50): Promise<void> {
    this.stop();
    this.killZombieProcess();

    // Resolve all preconditions outside the Promise
    const scriptPath = this.getScriptPath();
    if (!scriptPath) {
      throw new Error("Missing player.py. Ensure apps/cli/scripts/player.py exists.");
    }

    const absoluteTrackPath = path.resolve(trackPath);
    if (!fs.existsSync(absoluteTrackPath)) {
      throw new Error(`Audio file not found: ${absoluteTrackPath}`);
    }

    const pythonCmd = await this.resolvePythonCommand();

    // Now enter the Promise — executor is purely synchronous setup
    return new Promise((resolve, reject) => {
      const allArgs = [...pythonCmd.args, scriptPath, absoluteTrackPath, volume.toString()];

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
        err ? reject(err) : resolve();
      };

      this.pythonProcess.on("error", (err: NodeJS.ErrnoException) => {
        const msg = err.code === "ENOENT"
          ? `Python not found (tried: ${pythonCmd.cmd}). Install Python 3 and run: pip install pygame`
          : err.message;
        finish(new Error(`Audio engine: ${msg}`));
      });

      if (this.pythonProcess.pid) {
        try { fs.writeFileSync(PID_FILE, this.pythonProcess.pid.toString()); } catch {}
      }

      this.pythonProcess.stdout?.on("data", (data: Buffer) => {
        if (data.toString().includes("READY:")) {
          this.isReady = true;
          finish();
        }
      });

      this.pythonProcess.stderr?.on("data", (d: Buffer) => {
        const err = d.toString();
        if (!err.includes("pygame") && !err.includes("Hello from")) {
          console.error(chalk.red(`[Audio Engine]: ${err.trim()}`));
        }
      });

      this.pythonProcess.on("close", (code: number | null) => {
        this.isReady = false;
        this.cleanupPidFile();
        this.emit("stop");
        if (!settled) {
          const hint = code !== 0 && code !== null
            ? `Player exited (code ${code}). Is pygame installed? Run: pip install pygame`
            : "Audio stopped before ready. Check track file and pygame installation.";
          finish(new Error(hint));
        }
      });
    });
  }

  public setVolume(vol: number): void { this.send(`VOL:${Math.max(0, Math.min(100, vol))}`); }
  public pause():  void { this.send("PAUSE");  }
  public resume(): void { this.send("RESUME"); }

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
    // No-op — mood determines which track file is loaded upstream
  }

  private send(cmd: string): void {
    if (this.pythonProcess?.stdin && !this.pythonProcess.killed) {
      try { this.pythonProcess.stdin.write(cmd + "\n"); } catch { /* EPIPE — ignore */ }
    }
  }

  private cleanupPidFile(): void {
    if (fs.existsSync(PID_FILE)) {
      try { fs.unlinkSync(PID_FILE); } catch {}
    }
  }
}

export const audioService = new AudioService();