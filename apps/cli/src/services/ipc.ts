import net  from 'net';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import type { DaemonCmd, DaemonReply } from '@/services/daemon';

export { DAEMON_SOCK, DAEMON_PID } from '@/services/daemon';
import { DAEMON_SOCK, DAEMON_PID } from '@/services/daemon';

const CONNECT_TIMEOUT = 2000; // ms

// ─── Check if daemon is alive ─────────────────────────────────────────────────
export function isDaemonRunning(): boolean {
  if (!fs.existsSync(DAEMON_PID)) return false;
  try {
    const pid = parseInt(fs.readFileSync(DAEMON_PID, 'utf8').trim(), 10);
    if (isNaN(pid)) return false;
    process.kill(pid, 0); // existence check
    return true;
  } catch {
    return false;
  }
}

// ─── Send one command and wait for reply ──────────────────────────────────────
export function sendCommand(cmd: DaemonCmd): Promise<DaemonReply> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(DAEMON_SOCK)) {
      return reject(new Error('Daemon not running (socket not found)'));
    }

    const socket = net.createConnection({ path: DAEMON_SOCK });
    let   buf    = '';
    let   done   = false;

    const finish = (result: DaemonReply | Error) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    const timer = setTimeout(() => {
      finish(new Error('IPC timeout — daemon did not respond'));
    }, CONNECT_TIMEOUT);

    socket.on('connect', () => {
      socket.write(JSON.stringify(cmd) + '\n');
    });

    socket.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        clearTimeout(timer);
        try { finish(JSON.parse(line) as DaemonReply); }
        catch { finish(new Error('Invalid reply from daemon')); }
      }
    });

    socket.on('error', (err) => { clearTimeout(timer); finish(err); });
    socket.on('close', () => {
      clearTimeout(timer);
      if (!done) finish(new Error('Daemon closed connection unexpectedly'));
    });
  });
}

// ─── Convenience: send and ignore reply ──────────────────────────────────────
export async function sendCommandSilent(cmd: DaemonCmd): Promise<void> {
  try { await sendCommand(cmd); } catch {}
}

// ─── Ping: returns true if daemon responds ────────────────────────────────────
export async function pingDaemon(): Promise<boolean> {
  try {
    const reply = await sendCommand({ cmd: 'PING' });
    return reply.ok === true;
  } catch {
    return false;
  }
}

// ─── Get current state from daemon ────────────────────────────────────────────
export async function getDaemonState(): Promise<DaemonReply['state'] | null> {
  try {
    const reply = await sendCommand({ cmd: 'STATUS' });
    return reply.ok ? (reply.state ?? null) : null;
  } catch {
    return null;
  }
}