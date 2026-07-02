import { ipcMain, shell, type BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { IpcResult, RunProgress, RunStatus } from '../../types.js';

/**
 * Launches the user's project so it appears on screen: a package.json project
 * gets `npm install` (when needed) + its dev/start script with the printed
 * localhost URL opened in the browser; a plain index.html opens directly.
 * One managed child process per project folder; all are killed on quit.
 */

interface ManagedRun {
  child: ChildProcess;
  url: string | null;
  kind: 'dev-server';
}

const runs = new Map<string, ManagedRun>();

const IS_WIN = process.platform === 'win32';
const NPM = IS_WIN ? 'npm.cmd' : 'npm';
const URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+[^\s'"]*)/;
const URL_DETECT_TIMEOUT_MS = 30_000;

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function readPackageJson(repoPath: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await fs.readFile(join(repoPath, 'package.json'), 'utf-8')) as PackageJson;
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  return fs.access(path).then(
    () => true,
    () => false,
  );
}

function spawnNpm(args: string[], cwd: string): ChildProcess {
  // Windows needs shell:true to resolve npm.cmd; posix gets detached so the
  // whole process group (npm → node → vite …) can be killed together.
  return spawn(NPM, args, {
    cwd,
    shell: IS_WIN,
    detached: !IS_WIN,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });
}

function killRun(run: ManagedRun): void {
  const { child } = run;
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    if (IS_WIN) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    } else {
      // Negative pid = the detached process group, so grandchildren die too.
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    // Already gone.
  }
}

/** Kill every managed dev server (called from before-quit). */
export function stopAllRuns(): void {
  for (const run of runs.values()) killRun(run);
  runs.clear();
}

/** Wait for a localhost URL in the child's output, else guess-and-probe. */
function detectUrl(child: ChildProcess, pkg: PackageJson): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let tail = '';
    const settle = (url: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(url);
    };

    const onData = (buf: Buffer): void => {
      tail = (tail + buf.toString()).slice(-4000);
      const m = URL_RE.exec(buf.toString());
      if (m?.[1]) settle(m[1].replace('0.0.0.0', 'localhost').replace('127.0.0.1', 'localhost'));
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    child.on('exit', () => {
      // Died before printing a URL (crash, port conflict, syntax error).
      settle(null);
    });

    const timer = setTimeout(() => {
      void (async () => {
        // No URL printed — guess the conventional port for the stack and probe.
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const port = deps.vite ? 5173 : 3000;
        const guess = `http://localhost:${port}`;
        try {
          await fetch(guess, { signal: AbortSignal.timeout(3000) });
          settle(guess);
        } catch {
          settle(null);
        }
      })();
    }, URL_DETECT_TIMEOUT_MS);
  });
}

export function registerRunIpc(getWindow: () => BrowserWindow | null): void {
  const progress = (p: RunProgress): void => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('run:progress', p);
  };

  ipcMain.handle(
    'run:launch',
    async (
      _e,
      repoPath: string,
    ): Promise<IpcResult<{ url: string | null; kind: 'dev-server' | 'static' }>> => {
      try {
        // Already running: just re-open it ("show me" is idempotent).
        const existing = runs.get(repoPath);
        if (existing && existing.child.exitCode === null) {
          if (existing.url) void shell.openExternal(existing.url);
          return { url: existing.url, kind: 'dev-server' };
        }

        const pkg = await readPackageJson(repoPath);
        const script = pkg?.scripts?.dev ? 'dev' : pkg?.scripts?.start ? 'start' : pkg?.scripts?.preview ? 'preview' : null;

        // No runnable script → static page fallback.
        if (!pkg || !script) {
          const indexHtml = join(repoPath, 'index.html');
          if (await exists(indexHtml)) {
            const err = await shell.openPath(indexHtml);
            if (err) return { error: `Couldn't open the page: ${err}` };
            return { url: null, kind: 'static' };
          }
          return { error: "I don't see anything runnable in this project yet." };
        }

        // Install dependencies when they're declared but missing.
        const hasDeps =
          Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length > 0;
        if (hasDeps && !(await exists(join(repoPath, 'node_modules')))) {
          progress({ stage: 'installing' });
          const ok = await new Promise<boolean>((resolve) => {
            const install = spawnNpm(['install'], repoPath);
            install.on('error', () => resolve(false));
            install.on('exit', (code) => resolve(code === 0));
          });
          if (!ok) {
            return {
              error:
                "I couldn't install the project's dependencies — you'll need Node.js and npm set up on this computer.",
            };
          }
        }

        progress({ stage: 'starting' });
        const child = spawnNpm(['run', script], repoPath);
        if (child.pid === undefined) {
          return { error: "I couldn't find npm on this computer — install Node.js to run this project." };
        }
        const run: ManagedRun = { child, url: null, kind: 'dev-server' };
        runs.set(repoPath, run);
        child.on('exit', () => {
          if (runs.get(repoPath)?.child === child) runs.delete(repoPath);
          progress({ stage: 'exited' });
        });

        const url = await detectUrl(child, pkg);
        if (child.exitCode !== null) {
          runs.delete(repoPath);
          return { error: 'The project started but shut down right away — it may have an error.' };
        }
        run.url = url;
        if (url) {
          void shell.openExternal(url);
          progress({ stage: 'ready', detail: url });
        }
        return { url, kind: 'dev-server' };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not launch the project.' };
      }
    },
  );

  ipcMain.handle('run:stop', async (_e, repoPath?: string): Promise<IpcResult<{ ok: true }>> => {
    try {
      if (repoPath) {
        const run = runs.get(repoPath);
        if (run) {
          killRun(run);
          runs.delete(repoPath);
        }
      } else {
        stopAllRuns();
      }
      return { ok: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not stop the project.' };
    }
  });

  ipcMain.handle('run:status', async (_e, repoPath: string): Promise<RunStatus> => {
    const run = runs.get(repoPath);
    if (!run || run.child.exitCode !== null) return { running: false, url: null, kind: null };
    return { running: true, url: run.url, kind: run.kind };
  });
}
