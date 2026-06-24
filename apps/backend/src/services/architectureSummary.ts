import { getSupabase } from '../db/client.js';

/**
 * A one-time, repo-level architecture overview generated at index time (see
 * indexer.ts) and reused across voice turns for high-level questions. Stored on
 * the repos row; mirrored in an in-memory cache so turns don't hit the DB every
 * time. Survives a backend restart via the DB read.
 */

const cache = new Map<string, string>();

/** Record a freshly generated summary (called from the indexer). */
export function setArchitectureSummary(repoId: string, summary: string): void {
  cache.set(repoId, summary);
}

/** Fetch the summary for a repo: in-memory first, then the repos row. */
export async function getArchitectureSummary(repoId: string): Promise<string | undefined> {
  const cached = cache.get(repoId);
  if (cached !== undefined) return cached;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('repos')
      .select('architecture_summary')
      .eq('id', repoId)
      .single();
    const summary = data?.architecture_summary as string | null | undefined;
    if (error || !summary) return undefined;
    cache.set(repoId, summary);
    return summary;
  } catch {
    return undefined;
  }
}

/** Drop the cached summary (e.g. after a re-index regenerates it). */
export function clearArchitectureSummary(repoId?: string): void {
  if (repoId) cache.delete(repoId);
  else cache.clear();
}
