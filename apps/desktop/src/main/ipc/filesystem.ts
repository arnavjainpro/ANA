import { ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { isForbidden, resolveWithinRoot } from '../lib/fsSafe.js';
import { getCurrentRepoRoot } from '../lib/repoPaths.js';
import type { FilePatch, IpcResult } from '../../types.js';

const TMP_SUFFIX = '.ana-tmp';

/**
 * Atomic write: write to a sibling temp file, then rename over the target.
 * Rename is atomic on macOS and Windows, so the target is never left partially
 * written even if the process is killed mid-write.
 */
async function atomicWrite(absPath: string, contents: string): Promise<void> {
  const tmp = absPath + TMP_SUFFIX;
  // Clear any stale temp from a previously interrupted write.
  await fs.rm(tmp, { force: true }).catch(() => {});
  try {
    await fs.writeFile(tmp, contents, 'utf-8');
    await fs.rename(tmp, absPath);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/**
 * Apply a batch of patches atomically. ALL patches are validated first — path
 * safety, protected-file check, and `original` matching current on-disk
 * contents — before anything is written. If any check fails, nothing is
 * written (never partial batches). Used by the Build turn and undo flows.
 */
export async function applyPatchesToDisk(repoPath: string, patches: FilePatch[]): Promise<void> {
  // Phase 1 — validate every patch.
  for (const patch of patches) {
    if (isForbidden(patch.path)) {
      throw new Error(`"${patch.path}" is a protected file and can't be changed.`);
    }
    const abs = resolveWithinRoot(repoPath, patch.path);
    let current = '';
    try {
      current = await fs.readFile(abs, 'utf-8');
    } catch {
      current = ''; // new file
    }
    if (current !== patch.original) {
      throw new Error(
        `"${patch.path}" changed on disk since Ana read it — skipping to avoid overwriting your edits.`,
      );
    }
  }

  // Phase 2 — write everything (all inputs already validated).
  for (const patch of patches) {
    const abs = resolveWithinRoot(repoPath, patch.path);
    await fs.mkdir(dirname(abs), { recursive: true });
    await atomicWrite(abs, patch.updated);
  }
}

export function registerFilesystemIpc(): void {
  ipcMain.handle(
    'fs:readFile',
    async (_e, repoPath: string, relPath: string): Promise<IpcResult<{ contents: string }>> => {
      try {
        if (isForbidden(relPath)) return { error: `Reading "${relPath}" is not allowed.` };
        const abs = resolveWithinRoot(repoPath, relPath);
        return { contents: await fs.readFile(abs, 'utf-8') };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not read file.' };
      }
    },
  );

  ipcMain.handle(
    'fs:writeFile',
    async (
      _e,
      repoPath: string,
      relPath: string,
      contents: string,
    ): Promise<IpcResult<{ success: true }>> => {
      try {
        if (isForbidden(relPath)) return { error: `Writing "${relPath}" is not allowed.` };
        const abs = resolveWithinRoot(repoPath, relPath);
        await fs.mkdir(dirname(abs), { recursive: true });
        await atomicWrite(abs, contents);
        return { success: true };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not write file.' };
      }
    },
  );

  ipcMain.handle('fs:getRepoRoot', async (): Promise<{ repoPath: string | null }> => {
    return { repoPath: getCurrentRepoRoot() };
  });
}
