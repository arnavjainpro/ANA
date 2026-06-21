import { getSupabase } from '../db/client.js';
import { embedQuery } from './embeddings.js';
import type { RetrievedChunk } from '../lib/types.js';

// Top-k for RAG. Spec: start at 5; drop to 3 if retrieval exceeds 50ms budget.
const DEFAULT_TOP_K = 5;

/**
 * Embed the query and run a cosine-similarity search scoped to one repo via
 * the `match_chunks` SQL function. Returns the top-k chunks with their paths.
 */
export async function retrieveChunks(
  repoId: string,
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedQuery(query);
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('match_chunks', {
    p_repo_id: repoId,
    query_embedding: queryEmbedding,
    match_count: topK,
  });

  if (error) {
    console.error(`[retrieval] match_chunks failed: ${error.message}`);
    return [];
  }

  const rows = (data ?? []) as Array<{ file_path: string; content: string; similarity: number }>;
  return rows.map((r) => ({
    filePath: r.file_path,
    content: r.content,
    similarity: r.similarity,
  }));
}
