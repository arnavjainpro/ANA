import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';

// Persists the user's chosen local working-copy path per repo (full_name →
// absolute folder). This is not a secret, so it is stored as plain JSON in
// userData. The most-recently-resolved path is also tracked in memory so
// `fs:getRepoRoot` can answer without a repo name.

function storeFile(): string {
  return join(app.getPath('userData'), 'repoPaths.json');
}

let currentRepoRoot: string | null = null;

async function readStore(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(storeFile(), 'utf-8')) as Record<string, string>;
  } catch {
    return {};
  }
}

async function writeStore(map: Record<string, string>): Promise<void> {
  await fs.writeFile(storeFile(), JSON.stringify(map, null, 2), 'utf-8');
}

/** Return the stored path for a repo if it still exists on disk, else null. */
export async function getStoredRepoPath(fullName: string): Promise<string | null> {
  const map = await readStore();
  const path = map[fullName];
  if (!path) return null;
  try {
    await fs.access(path);
    currentRepoRoot = path;
    return path;
  } catch {
    return null;
  }
}

/** Persist a repo's local path and mark it as the current root. */
export async function setStoredRepoPath(fullName: string, path: string): Promise<void> {
  const map = await readStore();
  map[fullName] = path;
  await writeStore(map);
  currentRepoRoot = path;
}

export function getCurrentRepoRoot(): string | null {
  return currentRepoRoot;
}

/**
 * Confirm a chosen folder is the local clone of `fullName`: either its git
 * remote references the repo, or the folder is named after the repo.
 */
export async function validateRepoFolder(folder: string, fullName: string): Promise<boolean> {
  const shortName = fullName.split('/').pop()?.toLowerCase() ?? '';
  try {
    const config = await fs.readFile(join(folder, '.git', 'config'), 'utf-8');
    if (config.toLowerCase().includes(fullName.toLowerCase())) return true;
  } catch {
    // Not a git checkout (or unreadable config) — fall through to the name check.
  }
  return basename(folder).toLowerCase() === shortName;
}
