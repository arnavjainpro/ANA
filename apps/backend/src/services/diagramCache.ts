// In-memory cache of frozen diagram artifacts, keyed by repo. Each artifact is
// generated once — the overview at index time, detail maps on first request —
// and then reused byte-for-byte, so re-asking for the same view never redraws
// and never drifts into a different architecture. Nothing is persisted: the
// cache lives for the process lifetime and is cleared per repo on re-index.
//
// Modeled on services/history.ts (a plain in-memory Map, no external state).

import type { DiagramPayload } from '../lib/types.js';

/** The two kinds of cached diagram. 'overview' is the single canonical
 *  whole-repo map; 'detail' is a per-subject deep-dive map. */
export type DiagramKind = 'overview' | 'detail';

// repoId -> cacheKey -> frozen payload.
const cache = new Map<string, Map<string, DiagramPayload>>();

/** Squash a subject to a stable key so "AuthAPI", "Auth API", and "auth-api"
 *  all resolve to one cached detail map. */
export function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function keyFor(kind: DiagramKind, subject: string | null | undefined): string {
  return kind === 'overview' ? 'overview' : `detail:${normalizeSubject(subject)}`;
}

/** Fetch a cached diagram, or null if it hasn't been generated yet. */
export function getDiagram(
  repoId: string,
  kind: DiagramKind,
  subject: string | null = null,
): DiagramPayload | null {
  return cache.get(repoId)?.get(keyFor(kind, subject)) ?? null;
}

/** Store a freshly generated diagram so every later request reuses it verbatim. */
export function setDiagram(
  repoId: string,
  kind: DiagramKind,
  subject: string | null,
  payload: DiagramPayload,
): void {
  let repoCache = cache.get(repoId);
  if (!repoCache) {
    repoCache = new Map<string, DiagramPayload>();
    cache.set(repoId, repoCache);
  }
  repoCache.set(keyFor(kind, subject), payload);
}

/** True once the canonical overview has been generated for this repo. */
export function hasOverview(repoId: string): boolean {
  return cache.get(repoId)?.has('overview') ?? false;
}

/** Drop every cached diagram for a repo — called when the repo is re-indexed so
 *  stale maps don't outlive the code they describe. */
export function invalidateRepo(repoId: string): void {
  cache.delete(repoId);
}
