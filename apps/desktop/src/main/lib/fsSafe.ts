import { resolve, sep } from 'node:path';

// Path-safety helpers shared by the filesystem IPC handlers. These mirror the
// backend builder's validation (defence in depth) but operate against the real
// absolute repo root on disk.

/** Relative paths that must never be read or written. */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\.|$)/i, // .env, .env.local, ...
  /\.(key|pem|p12|cert|secret)$/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)node_modules(\/|$)/i,
];

/** True when a relative path matches a protected pattern. */
export function isForbidden(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  return FORBIDDEN_PATTERNS.some((re) => re.test(norm));
}

/**
 * Resolve a relative path against the repo root and confirm it stays inside.
 * Throws on traversal / absolute escape so callers can never touch other files.
 */
export function resolveWithinRoot(root: string, relPath: string): string {
  const absRoot = resolve(root);
  const abs = resolve(absRoot, relPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) {
    throw new Error(`Path "${relPath}" is outside the repository.`);
  }
  return abs;
}
