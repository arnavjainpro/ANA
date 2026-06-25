import { ipcMain, dialog, BrowserWindow, type OpenDialogOptions } from 'electron';
import { backendJson } from '../lib/backend.js';
import { loadGitHubToken } from '../lib/tokenStore.js';
import {
  getStoredRepoPath,
  setStoredRepoPath,
  validateRepoFolder,
} from '../lib/repoPaths.js';
import { applyPatchesToDisk, readLocalFiles } from './filesystem.js';
import { stagePaths } from './git.js';
import type { BuildResult, BuildTurnRequest, IpcResult, UndoResult } from '../../types.js';

export function registerBuildIpc(): void {
  // Return the persisted local path for a repo (if it still exists on disk).
  ipcMain.handle(
    'build:getRepoPath',
    async (_e, fullName: string): Promise<{ repoPath: string | null }> => {
      return { repoPath: await getStoredRepoPath(fullName) };
    },
  );

  // Folder picker → validate against the connected repo → persist → return path.
  ipcMain.handle(
    'build:selectRepoPath',
    async (_e, fullName: string): Promise<IpcResult<{ repoPath: string }>> => {
      try {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        const opts: OpenDialogOptions = {
          properties: ['openDirectory'],
          title: `Select your local clone of ${fullName}`,
        };
        const result = win
          ? await dialog.showOpenDialog(win, opts)
          : await dialog.showOpenDialog(opts);

        const folder = result.filePaths[0];
        if (result.canceled || !folder) return { error: 'cancelled' };

        if (!(await validateRepoFolder(folder, fullName))) {
          return {
            error: `That folder doesn't look like ${fullName}. Pick the local clone of this repository.`,
          };
        }
        await setStoredRepoPath(fullName, folder);
        return { repoPath: folder };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not select folder.' };
      }
    },
  );

  // Run a Build turn: backend reasons + records the op, then we apply the
  // patches to disk atomically and stage them. If the disk apply fails, we roll
  // the backend's recorded operation back so the undo stack stays truthful.
  ipcMain.handle(
    'build:turn',
    async (_e, req: BuildTurnRequest): Promise<IpcResult<BuildResult>> => {
      try {
        const token = await loadGitHubToken();
        // Phase 1: backend picks candidate target paths (classify + RAG).
        const plan = await backendJson<{ paths: string[] }>('/conversation/build/plan', {
          method: 'POST',
          body: JSON.stringify({
            transcript: req.transcript,
            history: req.history,
            repoId: req.repoId,
            repoFullName: req.repoFullName,
          }),
        });
        // Read those files from the LOCAL working copy so Ana's `original`
        // matches disk exactly (regardless of branch / EOL / uncommitted edits).
        const files = await readLocalFiles(req.repoPath, plan.paths);
        // Phase 2: reason over the local contents and return patches.
        const result = await backendJson<BuildResult>('/conversation/build', {
          method: 'POST',
          body: JSON.stringify({ ...req, files }),
          githubToken: token ?? undefined,
        });

        if (result.patches.length > 0) {
          try {
            await applyPatchesToDisk(req.repoPath, result.patches);
            await stagePaths(
              req.repoPath,
              result.patches.map((p) => p.path),
            );
          } catch (applyErr) {
            await backendJson('/conversation/undo', {
              method: 'POST',
              body: JSON.stringify({ sessionId: req.sessionId }),
            }).catch(() => {});
            return {
              error: applyErr instanceof Error ? applyErr.message : 'Could not apply changes.',
            };
          }
        }
        return result;
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Build turn failed.' };
      }
    },
  );

  // Undo the last operation: backend pops + reverses, we apply to disk + stage.
  ipcMain.handle(
    'build:undo',
    async (_e, sessionId: string, repoPath: string): Promise<IpcResult<UndoResult>> => {
      try {
        const result = await backendJson<UndoResult>('/conversation/undo', {
          method: 'POST',
          body: JSON.stringify({ sessionId }),
        });
        if (result.patches.length > 0) {
          await applyPatchesToDisk(repoPath, result.patches);
          await stagePaths(
            repoPath,
            result.patches.map((p) => p.path),
          );
        }
        return result;
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Undo failed.' };
      }
    },
  );

  // Clear the session's undo history (GitHub disconnect / app close).
  ipcMain.handle('build:endSession', async (_e, sessionId: string): Promise<{ ok: true }> => {
    try {
      await backendJson('/conversation/session/end', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      // Best effort — the in-memory stack dies with the backend anyway.
    }
    return { ok: true };
  });
}
