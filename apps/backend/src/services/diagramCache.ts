// Read-through cache of frozen diagram artifacts, keyed by repo. Each artifact
// is generated once — the overviews at index time, detail maps on first request
// — then reused byte-for-byte, so re-asking for the same view never redraws and
// never drifts into a different architecture. Artifacts are persisted in the
// repo_diagrams table so they survive backend restarts (a restart used to
// re-roll the overview into a different map); the in-memory Map in front keeps
// the voice path off the DB. Cleared per repo on re-index.

import { getSupabase } from '../db/client.js';
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

function remember(repoId: string, cacheKey: string, payload: DiagramPayload): void {
  let repoCache = cache.get(repoId);
  if (!repoCache) {
    repoCache = new Map<string, DiagramPayload>();
    cache.set(repoId, repoCache);
  }
  repoCache.set(cacheKey, payload);
}

/**
 * Fetch a cached diagram: memory first, then the repo_diagrams row (hydrating
 * memory on a hit). Null if it hasn't been generated yet. Never throws — a DB
 * failure just reads as a miss.
 */
export async function getDiagram(
  repoId: string,
  kind: DiagramKind,
  parts: DiagramKeyParts = {},
): Promise<DiagramPayload | null> {
  const cacheKey = keyFor(kind, parts);
  const inMemory = cache.get(repoId)?.get(cacheKey);
  if (inMemory) return inMemory;

  try {
    const { data, error } = await getSupabase()
      .from('repo_diagrams')
      .select('payload')
      .eq('repo_id', repoId)
      .eq('cache_key', cacheKey)
      .maybeSingle();
    const payload = data?.payload as DiagramPayload | null | undefined;
    if (error || !payload?.mermaid) return null;
    remember(repoId, cacheKey, payload);
    return payload;
  } catch {
    return null;
  }
}

/**
 * Store a freshly generated diagram so every later request — this session or
 * the next — reuses it verbatim. The memory write is immediate; the DB upsert
 * is awaited so index-time generation is durable, but a DB failure only logs
 * (the in-memory copy still serves this process).
 */
export async function setDiagram(
  repoId: string,
  kind: DiagramKind,
  parts: DiagramKeyParts,
  payload: DiagramPayload,
): Promise<void> {
  const cacheKey = keyFor(kind, parts);
  remember(repoId, cacheKey, payload);
  try {
    const { error } = await getSupabase()
      .from('repo_diagrams')
      .upsert(
        { repo_id: repoId, cache_key: cacheKey, payload },
        { onConflict: 'repo_id,cache_key' },
      );
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error(
      `[diagramCache] persist failed for ${cacheKey}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Drop every cached diagram for a repo — memory and DB — called when the repo
 *  is re-indexed so stale maps don't outlive the code they describe. */
export async function invalidateRepo(repoId: string): Promise<void> {
  cache.delete(repoId);
  try {
    const { error } = await getSupabase().from('repo_diagrams').delete().eq('repo_id', repoId);
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error(
      '[diagramCache] invalidate failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
