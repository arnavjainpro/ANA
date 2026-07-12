import { ipcMain, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import { getCurrentRepoRoot } from '../lib/repoPaths.js';
import type { IpcResult } from '../../types.js';

/**
 * A VS Code-style integrated terminal: real PTY sessions (one per open tab),
 * owned by the main process so they survive renderer reloads. Output streams
 * to the renderer as raw bytes — there is no command interception or
 * filtering here, this is a real shell (same trust boundary as opening
 * Terminal.app), not a sandboxed tool.
 */

const IS_WIN = process.platform === 'win32';
const sessions = new Map<string, IPty>();

function defaultShell(): string {
  if (IS_WIN) return process.env.COMSPEC || 'powershell.exe';
  return process.env.SHELL || '/bin/zsh';
}

// Best-effort backstop against obviously destructive commands Ana might be
// asked (or talked) into running on the user's behalf — not a security
// boundary (the user's own keystrokes via `terminal:write` are never checked,
// same trust level as opening Terminal.app), just a guard on the one path
// that runs a command autonomously from a voice request.
const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+.*-[a-z]*r[a-z]*f|\brm\s+.*-[a-z]*f[a-z]*r/i, // rm -rf / rm -fr (any flag order)
  /\bsudo\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/(sd|nvme|disk|hd)/i,
  /\bchmod\s+-R\s+777\s+\//i,
  /\bgit\s+push\s+.*--force/i,
  /\bgit\s+reset\s+--hard/i,
  /\bgit\s+clean\s+.*-[a-z]*f/i,
  /\bshutdown\b|\breboot\b|\bkillall\b/i,
  /curl[^|]*\|\s*(sh|bash)\b/i,
  /wget[^|]*\|\s*(sh|bash)\b/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb
];

function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some((re) => re.test(command));
}

/** Kill every open session (called from before-quit so no shell outlives the app). */
export function killAllTerminals(): void {
  for (const session of sessions.values()) {
    try {
      session.kill();
    } catch {
      // Already gone.
    }
  }
  sessions.clear();
}

export function registerTerminalIpc(getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, payload: unknown): void => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  ipcMain.handle('terminal:create', async (_e, cwd?: string): Promise<IpcResult<{ id: string }>> => {
    try {
      const id = randomUUID();
      const session = pty.spawn(defaultShell(), IS_WIN ? [] : ['-l'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: cwd || getCurrentRepoRoot() || homedir(),
        env: process.env as Record<string, string>,
      });
      sessions.set(id, session);
      session.onData((data) => send('terminal:data', { id, data }));
      session.onExit(({ exitCode }) => {
        sessions.delete(id);
        send('terminal:exit', { id, exitCode });
      });
      return { id };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not start a terminal session.' };
    }
  });

  ipcMain.handle(
    'terminal:write',
    async (_e, id: string, data: string): Promise<IpcResult<{ ok: true }>> => {
      const session = sessions.get(id);
      if (!session) return { error: 'That terminal session has ended.' };
      session.write(data);
      return { ok: true };
    },
  );

  ipcMain.handle(
    'terminal:run',
    async (_e, id: string, command: string): Promise<IpcResult<{ ok: true }>> => {
      const session = sessions.get(id);
      if (!session) return { error: 'That terminal session has ended.' };
      if (isDangerousCommand(command)) {
        return { error: `"${command}" looks destructive, so I won't run that automatically.` };
      }
      session.write(`${command}\r`);
      return { ok: true };
    },
  );

  ipcMain.handle(
    'terminal:resize',
    async (_e, id: string, cols: number, rows: number): Promise<IpcResult<{ ok: true }>> => {
      const session = sessions.get(id);
      if (!session) return { error: 'That terminal session has ended.' };
      if (cols > 0 && rows > 0) session.resize(cols, rows);
      return { ok: true };
    },
  );

  ipcMain.handle('terminal:kill', async (_e, id: string): Promise<IpcResult<{ ok: true }>> => {
    const session = sessions.get(id);
    if (session) {
      session.kill();
      sessions.delete(id);
    }
    return { ok: true };
  });
}
