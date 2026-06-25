import { ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { isForbidden, resolveWithinRoot } from '../lib/fsSafe.js';
import { getCurrentRepoRoot } from '../lib/repoPaths.js';
import type { FilePatch, IpcResult, RepoTreeNode } from '../../types.js';

const TMP_SUFFIX = '.ana-tmp';

/**
 * Recursively walk the working copy into a flat `RepoTreeNode[]` (same shape as
 * the GitHub tree, so the renderer's FileTree renders it unchanged). Forbidden
 * trees (`.git`, `node_modules`, secrets) are skipped before recursing, and
 * symlinked directories are ignored (Dirent.isDirectory() is false for them),
 * so the walk can't follow links out of the repo or loop. Paths are relative
 * and forward-slashed for cross-platform consistency.
 */
async function walkDir(root: string, rel: string): Promise<RepoTreeNode[]> {
  const absDir = rel ? join(root, rel) : root;
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const nodes: RepoTreeNode[] = [];
  for (const entry of entries) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (isForbidden(childRel)) continue;
    if (entry.isDirectory()) {
      nodes.push({ path: childRel, name: entry.name, type: 'dir', size: 0 });
      nodes.push(...(await walkDir(root, childRel)));
    } else if (entry.isFile()) {
      // size is unused by the tree UI; left 0 to avoid a stat() per file.
      nodes.push({ path: childRel, name: entry.name, type: 'file', size: 0 });
    }
  }
  return nodes;
}

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

/** Strip CR so EOL differences (CRLF vs LF) don't cause false mismatches. */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/** The EOL style a file already uses on disk (CRLF if any present, else LF). */
function detectEol(text: string): '\r\n' | '\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** Re-apply a target EOL style to text (which may currently use either). */
function applyEol(text: string, eol: '\r\n' | '\n'): string {
  const lf = text.replace(/\r\n/g, '\n');
  return eol === '\r\n' ? lf.replace(/\n/g, '\r\n') : lf;
}

/**
 * Apply a batch of patches atomically. ALL patches are validated first — path
 * safety, protected-file check, and `original` matching current on-disk
 * contents — before anything is written. If any check fails, nothing is
 * written (never partial batches). Used by the Build turn and undo flows.
 */
export async function applyPatchesToDisk(repoPath: string, patches: FilePatch[]): Promise<void> {
  // Phase 1 — validate every patch, capturing each file's on-disk EOL style.
  // The match is EOL-insensitive: Ana's `original` comes from GitHub (LF) while
  // the local checkout may be CRLF (Windows), and that difference must not read
  // as "the file changed".
  const eolByPath = new Map<string, '\r\n' | '\n'>();
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
    if (normalizeEol(current) !== normalizeEol(patch.original)) {
      throw new Error(
        `"${patch.path}" changed on disk since Ana read it — skipping to avoid overwriting your edits.`,
      );
    }
    eolByPath.set(patch.path, detectEol(current));
  }

  // Phase 2 — write everything, preserving each file's existing EOL style so a
  // CRLF file stays CRLF (no whole-file line-ending diff). New files default to LF.
  for (const patch of patches) {
    const abs = resolveWithinRoot(repoPath, patch.path);
    await fs.mkdir(dirname(abs), { recursive: true });
    await atomicWrite(abs, applyEol(patch.updated, eolByPath.get(patch.path) ?? '\n'));
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

  ipcMain.handle(
    'fs:listDir',
    async (_e, repoPath: string): Promise<IpcResult<{ tree: RepoTreeNode[] }>> => {
      try {
        const tree = await walkDir(repoPath, '');
        tree.sort((a, b) => a.path.localeCompare(b.path));
        return { tree };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not list the project folder.' };
      }
    },
  );

  ipcMain.handle('fs:getRepoRoot', async (): Promise<{ repoPath: string | null }> => {
    return { repoPath: getCurrentRepoRoot() };
  });
}
