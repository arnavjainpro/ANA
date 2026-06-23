// Validates a batch of Build-mode patches before they are sent to the renderer
// for disk write. This service NEVER writes to disk itself — the desktop main
// process performs the atomic write and re-enforces these same rules (defence
// in depth). The on-disk "original matches current contents" check (rule 4)
// can only run where the files live, so it is enforced in the main process at
// apply time; here we enforce everything that is path/shape based.

import { randomUUID } from 'node:crypto';
import type { FilePatch, ValidationResult } from '../lib/types.js';

/** Hard cap on files touched per operation. */
const MAX_FILES = 5;

/**
 * Path patterns that must never be written, matched against the relative path.
 * Secrets, certs, and VCS/dependency internals.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\.|$)/i, // .env, .env.local, .env.production, ...
  /\.(key|pem|p12|cert|secret)$/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)node_modules(\/|$)/i,
];

/** True when a relative path tries to escape the repo root or is absolute. */
function isUnsafePath(relPath: string): boolean {
  if (!relPath || relPath.trim() === '') return true;
  // Absolute paths (posix or Windows drive) are not allowed.
  if (relPath.startsWith('/') || relPath.startsWith('\\') || /^[a-zA-Z]:/.test(relPath)) {
    return true;
  }
  // Normalise separators and reject any traversal segment.
  const segments = relPath.replace(/\\/g, '/').split('/');
  return segments.some((seg) => seg === '..');
}

/**
 * Validate a batch of patches. Returns `{ valid: false, reason }` on the first
 * problem found so Ana can speak the reason. The batch is all-or-nothing.
 */
export async function validatePatches(patches: FilePatch[]): Promise<ValidationResult> {
  if (patches.length === 0) {
    return { valid: false, reason: 'No changes were produced.' };
  }
  if (patches.length > MAX_FILES) {
    return {
      valid: false,
      reason: `That change would touch ${patches.length} files, but I can only change up to ${MAX_FILES} at once. Let's break it into smaller steps.`,
    };
  }

  for (const patch of patches) {
    if (isUnsafePath(patch.path)) {
      return { valid: false, reason: `I can't write to "${patch.path}" — it's outside the project.` };
    }
    if (FORBIDDEN_PATTERNS.some((re) => re.test(patch.path))) {
      return {
        valid: false,
        reason: `I won't modify "${patch.path}" — that's a protected configuration or secret file.`,
      };
    }
  }

  return { valid: true };
}

/** Generate a unique id for an operation (used by the undo stack). */
export function generateOperationId(): string {
  return randomUUID();
}
