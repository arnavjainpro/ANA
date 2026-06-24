import { getRepo, getRepoTree, getFileContents } from './github.js';
import type { RepoTreeNode } from '../lib/types.js';

/**
 * A compact, whole-project "map" (condensed file tree + README excerpt) used to
 * give voice turns a bird's-eye view. Top-5 RAG chunks only cover a question's
 * immediate neighbourhood, so without this Ana says she "can't see the whole
 * project" for high-level/architecture questions. Built once per repo and cached
 * in memory (the structure rarely changes within a session).
 */

// Directory names that are pure noise in a structural overview.
const EXCLUDED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  '.turbo',
  '.cache',
  'vendor',
]);

// Bounds so the map stays a few thousand tokens at most.
const MAX_DEPTH = 3;
const MAX_LINES = 200;
const README_CHARS = 1500;

const cache = new Map<string, string>();

function isNoise(path: string): boolean {
  return path.split('/').some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

/** Render the tree as a shallow, indented outline (dirs + files, bounded). */
function renderTree(nodes: RepoTreeNode[]): string {
  const filtered = nodes
    .filter((n) => !isNoise(n.path) && n.path.split('/').length - 1 <= MAX_DEPTH)
    .sort((a, b) => a.path.localeCompare(b.path));

  const lines: string[] = [];
  for (const node of filtered) {
    const depth = node.path.split('/').length - 1;
    lines.push(`${'  '.repeat(depth)}${node.name}${node.type === 'dir' ? '/' : ''}`);
    if (lines.length >= MAX_LINES) {
      lines.push('… (structure truncated)');
      break;
    }
  }
  return lines.join('\n');
}

/**
 * Build (or return cached) the project map for a repo. Best-effort: returns
 * undefined if it can't be built, so a turn proceeds with chunks alone.
 */
export async function getProjectMap(
  repoFullName: string,
  githubToken: string,
): Promise<string | undefined> {
  const cached = cache.get(repoFullName);
  if (cached !== undefined) return cached;

  try {
    const repo = await getRepo(githubToken, repoFullName);
    const tree = await getRepoTree(githubToken, repoFullName, repo.default_branch);
    if (tree.length === 0) return undefined;

    let readme = '';
    try {
      readme = (await getFileContents(githubToken, repoFullName, 'README.md')).slice(0, README_CHARS);
    } catch {
      // No README at the standard path — the tree alone is still useful.
    }

    const parts = [`Repository: ${repoFullName}`, `File structure:\n${renderTree(tree)}`];
    if (readme.trim()) parts.push(`README (excerpt):\n${readme}`);
    const map = parts.join('\n\n');

    cache.set(repoFullName, map);
    return map;
  } catch (err) {
    console.error('[projectMap] build failed:', err instanceof Error ? err.message : err);
    return undefined;
  }
}

/** Drop a cached map (e.g. after a re-index) so the next turn rebuilds it. */
export function clearProjectMap(repoFullName?: string): void {
  if (repoFullName) cache.delete(repoFullName);
  else cache.clear();
}
