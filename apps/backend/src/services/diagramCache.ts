// In-memory cache of frozen diagram artifacts, keyed by repo. Each artifact is
// generated once — the overview at index time, detail maps on first request —
// and then reused byte-for-byte, so re-asking for the same view never redraws
// and never drifts into a different architecture. Nothing is persisted: the
// cache lives for the process lifetime and is cleared per repo on re-index.
//
// Modeled on services/history.ts (a plain in-memory Map, no external state).

import type { DiagramDepth, DiagramPayload } from '../lib/types.js';

/** The two kinds of cached diagram. 'overview' is the canonical whole-repo map
 *  (one per depth); 'detail' is a per-subject deep-dive map. */
export type DiagramKind = 'overview' | 'detail';

// repoId -> cacheKey -> frozen payload.
const cache = new Map<string, Map<string, DiagramPayload>>();

/** Squash a subject to a stable key so "AuthAPI", "Auth API", and "auth-api"
 *  all resolve to one cached detail map. */
export function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

interface DiagramKeyParts {
  subject?: string | null;
  /** Only meaningful for the overview; defaults to 'basic'. */
  depth?: DiagramDepth;
}

function keyFor(kind: DiagramKind, parts: DiagramKeyParts): string {
  if (kind === 'overview') return `overview:${parts.depth ?? 'basic'}`;
  return `detail:${normalizeSubject(parts.subject)}`;
}

/** Fetch a cached diagram, or null if it hasn't been generated yet. */
export function getDiagram(
  repoId: string,
  kind: DiagramKind,
  parts: DiagramKeyParts = {},
): DiagramPayload | null {
  return cache.get(repoId)?.get(keyFor(kind, parts)) ?? null;
}

/** Store a freshly generated diagram so every later request reuses it verbatim. */
export function setDiagram(
  repoId: string,
  kind: DiagramKind,
  parts: DiagramKeyParts,
  payload: DiagramPayload,
): void {
  let repoCache = cache.get(repoId);
  if (!repoCache) {
    repoCache = new Map<string, DiagramPayload>();
    cache.set(repoId, repoCache);
  }
  repoCache.set(keyFor(kind, parts), payload);
}

/** True once the basic overview has been generated for this repo. */
export function hasOverview(repoId: string): boolean {
  return cache.get(repoId)?.has('overview:basic') ?? false;
}

/** Drop every cached diagram for a repo — called when the repo is re-indexed so
 *  stale maps don't outlive the code they describe. */
export function invalidateRepo(repoId: string): void {
  cache.delete(repoId);
}
