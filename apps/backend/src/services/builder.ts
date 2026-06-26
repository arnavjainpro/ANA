// Validates a batch of Build-mode patches before they are sent to the renderer
// for disk write. This service NEVER writes to disk itself — the desktop main
// process performs the atomic write and re-enforces these same rules (defence
// in depth). The on-disk "original matches current contents" check (rule 4)
// can only run where the files live, so it is enforced in the main process at
// apply time; here we enforce everything that is path/shape based.

import { randomUUID } from 'node:crypto';
import type { FileEditGroup, FilePatch, ValidationResult } from '../lib/types.js';

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

/** Strip CR so the model's LF snippets match a possibly-CRLF source file. */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * Apply a group's search/replace edits to `original`. Each `oldString` must
 * occur exactly once (else the location is ambiguous). Returns the new contents,
 * or null if any edit can't be placed. Edits apply in order against the running
 * text. A new file (original === '' and isNew) takes a single empty-oldString
 * edit whose newString is the whole file.
 */
function applyEdits(original: string, edits: FileEditGroup['edits'], isNew: boolean): string | null {
  if (isNew) {
    const first = edits[0];
    if (edits.length !== 1 || !first || normalizeEol(first.oldString ?? '') !== '') return null;
    return normalizeEol(first.newString ?? '');
  }
  let text = original;
  for (const edit of edits) {
    const oldString = normalizeEol(edit?.oldString ?? '');
    const newString = normalizeEol(edit?.newString ?? '');
    if (oldString === '') return null; // empty oldString is only valid for a new file
    const idx = text.indexOf(oldString);
    if (idx === -1) return null; // snippet not found
    if (text.indexOf(oldString, idx + oldString.length) !== -1) return null; // not unique
    text = text.slice(0, idx) + newString + text.slice(idx + oldString.length);
  }
  return text;
}

/**
 * Turn the model's per-file edits into full-file FilePatches by applying them to
 * the contents we already hold. Keeps the rest of the pipeline (disk write, undo)
 * working on whole files. `failed` lists paths whose edits couldn't be placed.
 */
export function assemblePatches(
  files: { path: string; contents: string }[],
  groups: FileEditGroup[],
): { patches: FilePatch[]; failed: string[] } {
  const byPath = new Map(files.map((f) => [f.path, normalizeEol(f.contents)]));
  const patches: FilePatch[] = [];
  const failed: string[] = [];

  for (const group of groups) {
    if (!group?.path || !Array.isArray(group.edits) || group.edits.length === 0) {
      if (group?.path) failed.push(group.path);
      continue;
    }
    const isNew = !byPath.has(group.path);
    const original = byPath.get(group.path) ?? '';
    const updated = applyEdits(original, group.edits, isNew);
    if (updated === null || updated === original) {
      failed.push(group.path);
      continue;
    }
    patches.push({
      path: group.path,
      original,
      updated,
      summary: group.summary || 'Updated file.',
    });
  }

  return { patches, failed };
}
