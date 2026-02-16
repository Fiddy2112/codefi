import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { EventEmitter } from 'events';
import chalk from 'chalk';

const PID_FILE = path.join(os.tmpdir(), 'codefi-player.pid');

class AudioService extends EventEmitter {
  private pythonProcess: ChildProcess | null = null;
  private isReady = false;

  private getScriptPath() {
    // Priority: dist scripts, then dev scripts, then fallback
    const paths = [
      path.resolve(__dirname, '../scripts/player.py'),    // Production (in dist)
      path.resolve(__dirname, '../../scripts/player.py'), // Development 
      path.resolve(process.cwd(), 'scripts/player.py'),   // Fallback
      path.resolve(process.cwd(), 'dist/scripts/player.py'), // Absolute fallback
    ];

    for (const p of paths) {
      if (fs.existsSync(p)) {
        console.log(`Found Python script at: ${p}`);
        return p;
      }
    }
    return null;
  }

  /** Python command: on Windows use `py -3` launcher if available, else `python` */
  private getPythonCommand(): { cmd: string; args: string[] } {
    const isWin = process.platform === 'win32';
    if (isWin) {
      // Prefer Windows Python launcher so playback works when `python` isn't in PATH
      return { cmd: 'py', args: ['-3'] };
    }
    return { cmd: 'python', args: [] };
  }

  public async play(trackPath: string, volume: number = 50): Promise<void> {
    this.stop();

    return new Promise((resolve, reject) => {
      const scriptPath = this.getScriptPath();
      if (!scriptPath) {
        return reject(new Error(
          '❌ Missing Python Script (player.py). Ensure apps/cli/scripts/player.py exists and is copied to dist/scripts when built.'
        ));
      }

      const absoluteTrackPath = path.resolve(trackPath);
      if (!fs.existsSync(absoluteTrackPath)) {
        return reject(new Error(`❌ Missing Audio File: ${absoluteTrackPath}`));
      }

      const { cmd, args } = this.getPythonCommand();
      const allArgs = [...args, scriptPath, absoluteTrackPath, volume.toString()];

      this.pythonProcess = spawn(cmd, allArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        detached: false,
        env: { ...process.env, PYGAME_HIDE_SUPPORT_PROMPT: '1' },
      });

      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve();
      };

      this.pythonProcess.on('error', (err: NodeJS.ErrnoException) => {
        const msg = err.code === 'ENOENT'
          ? `Python not found. Install Python 3 and pygame, or on Windows run "py -3 -m pip install pygame". (Tried: ${cmd})`
          : err.message;
        finish(new Error(`❌ Audio engine: ${msg}`));
      });

      if (this.pythonProcess.pid) {
        try {
          fs.writeFileSync(PID_FILE, this.pythonProcess.pid.toString());
        } catch {}
      }

      this.pythonProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('READY:')) {
          this.isReady = true;
          finish();
        }
      });

      this.pythonProcess.stderr?.on('data', (d) => {
        const err = d.toString();
        console.error(chalk.red(`[Audio Engine stderr]: ${err}`));
      });

      this.pythonProcess.on('close', (code, signal) => {
        this.isReady = false;
        this.cleanupPidFile();
        this.emit('stop');
        if (!settled) {
          finish(new Error(
            code !== null && code !== 0
              ? `Python player exited with code ${code}. Install pygame: pip install pygame (or py -3 -m pip install pygame on Windows).`
              : 'Audio process stopped before ready. Check that pygame is installed and the track file is valid.'
          ));
        }
        if (code !== 0 && code !== null) {
          console.log(chalk.yellow(`\nAudio process exited with code ${code}, signal: ${signal}`));
        }
      });
    });
  }

  public setVolume(vol: number) { this.send(`VOL:${vol}`); }
  public pause() { this.send('PAUSE'); }
  public resume() { this.send('RESUME'); }
  
  public stop() {
    this.send('STOP');
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.pythonProcess = null;
    }
    this.cleanupPidFile();
  }

  private send(cmd: string) {
    if (this.pythonProcess?.stdin && !this.pythonProcess.killed) {
      try {
        this.pythonProcess.stdin.write(cmd + '\n');
      } catch (e) {
        // Tránh lỗi "write EPIPE" khi process đã chết
      }
    }
  }

  private cleanupPidFile() {
    if (fs.existsSync(PID_FILE)) {
        try { fs.unlinkSync(PID_FILE); } catch {}
    }
  }
}

export const audioService = new AudioService();