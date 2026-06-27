import { getSupabase } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { chunkText } from '../lib/chunking.js';
import { isIndexable } from '../lib/fileFilter.js';
import { embedBatch } from './embeddings.js';
import { getRepo, getRepoTree, getFileContents } from './github.js';
import { generateArchitectureSummary, generateOverviewDiagram } from './claude.js';
import { renderRepoStructure, clearProjectMap } from './projectMap.js';
import { setArchitectureSummary, clearArchitectureSummary } from './architectureSummary.js';
import { setDiagram, invalidateRepo } from './diagramCache.js';
import type { RepoTreeNode } from '../lib/types.js';

const MAX_REPO_SIZE_KB = 50 * 1024; // 50MB hard cap (spec §7)
const EMBED_BATCH_SIZE = 64;

export interface IndexProgress {
  processed: number;
  total: number;
  currentFile: string;
}

export type ProgressCallback = (progress: IndexProgress) => void;

export interface IndexResult {
  repoId: string;
  filesIndexed: number;
  chunksStored: number;
  filesSkipped: number;
}

/**
 * Full repo indexing pipeline: size check → fetch tree → filter → chunk →
 * embed → store in pgvector. Per-file failures are logged and skipped; they
 * never abort the whole job.
 */
export async function indexRepo(
  token: string,
  fullName: string,
  onProgress: ProgressCallback,
): Promise<IndexResult> {
  const repo = await getRepo(token, fullName);

  if (repo.size > MAX_REPO_SIZE_KB) {
    throw new AppError(
      413,
      'REPO_TOO_LARGE',
      `Repository is ${(repo.size / 1024).toFixed(1)}MB, which exceeds the 50MB limit.`,
    );
  }

  const supabase = getSupabase();

  // Upsert the repo row and get its id.
  const { data: repoRow, error: repoErr } = await supabase
    .from('repos')
    .upsert(
      {
        github_id: repo.id,
        full_name: repo.full_name,
        default_branch: repo.default_branch,
        size_kb: repo.size,
      },
      { onConflict: 'github_id' },
    )
    .select('id')
    .single();

  if (repoErr || !repoRow) {
    throw new AppError(500, 'DB_UPSERT_FAILED', `Could not persist repo: ${repoErr?.message}`);
  }
  const repoId = repoRow.id as string;

  // Clear any prior chunks for a clean re-index.
  await supabase.from('chunks').delete().eq('repo_id', repoId);

  const tree = await getRepoTree(token, fullName, repo.default_branch);
  const files = tree.filter((node) => node.type === 'file' && isIndexable(node.path));

  let filesIndexed = 0;
  let filesSkipped = 0;
  let chunksStored = 0;
  const total = files.length;

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]!;
    onProgress({ processed: i, total, currentFile: file.path });
    try {
      const contents = await getFileContents(token, fullName, file.path);
      const chunks = chunkText(contents);
      if (chunks.length === 0) {
        filesSkipped += 1;
        continue;
      }

      for (let b = 0; b < chunks.length; b += EMBED_BATCH_SIZE) {
        const batch = chunks.slice(b, b + EMBED_BATCH_SIZE);
        const embeddings = await embedBatch(batch.map((c) => c.content));
        const rows = batch.map((c, idx) => ({
          repo_id: repoId,
          file_path: file.path,
          chunk_index: c.index,
          content: c.content,
          embedding: embeddings[idx]!,
        }));
        const { error: insertErr } = await supabase.from('chunks').insert(rows);
        if (insertErr) throw new Error(insertErr.message);
        chunksStored += rows.length;
      }
      filesIndexed += 1;
    } catch (err) {
      // Per-file failure: log and skip, never abort the job (spec rule).
      filesSkipped += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[indexer] skipped ${file.path}: ${message}`);
    }
  }

  onProgress({ processed: total, total, currentFile: '' });

  await supabase
    .from('repos')
    .update({ indexed_at: new Date().toISOString() })
    .eq('id', repoId);

  // Re-index invalidates the cached structure/summary/diagrams for this repo.
  clearProjectMap(fullName);
  clearArchitectureSummary(repoId);
  invalidateRepo(repoId);

  // Generate and persist the one-time architecture overview. Best-effort: a
  // failure here must not fail the index (the chunks are already stored).
  const summary = await buildArchitectureSummary(token, fullName, repoId, tree);

  // Freeze the canonical overview diagram so every "explain the architecture"
  // returns the identical map. Best-effort and independent of the summary.
  await buildOverviewDiagram(fullName, repoId, tree, summary);

  return { repoId, filesIndexed, chunksStored, filesSkipped };
}

/** Generate the architecture overview from the tree + README + package.json and
 *  persist it on the repo row (and the in-memory cache). Returns the summary so
 *  callers can reuse it without a DB round-trip. Never throws. */
async function buildArchitectureSummary(
  token: string,
  fullName: string,
  repoId: string,
  tree: RepoTreeNode[],
): Promise<string | undefined> {
  try {
    const structure = renderRepoStructure(tree);

    let readme = '';
    try {
      readme = (await getFileContents(token, fullName, 'README.md')).slice(0, 4000);
    } catch {
      // No README — structure + key files still produce a useful summary.
    }

    const keyFiles: { path: string; contents: string }[] = [];
    try {
      keyFiles.push({
        path: 'package.json',
        contents: (await getFileContents(token, fullName, 'package.json')).slice(0, 3000),
      });
    } catch {
      // Not a Node project, or no root package.json — fine.
    }

    const summary = await generateArchitectureSummary({
      repoFullName: fullName,
      structure,
      readme,
      keyFiles,
    });
    if (!summary.trim()) return undefined;

    await getSupabase()
      .from('repos')
      .update({ architecture_summary: summary })
      .eq('id', repoId);
    setArchitectureSummary(repoId, summary);
    return summary;
  } catch (err) {
    console.error(
      '[indexer] architecture summary failed:',
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}

/** Generate the canonical overview diagram once and freeze it in the diagram
 *  cache, so every later "explain the architecture" reuses the identical map
 *  instead of drawing a fresh (and different) one. Never throws. */
async function buildOverviewDiagram(
  fullName: string,
  repoId: string,
  tree: RepoTreeNode[],
  architectureSummary: string | undefined,
): Promise<void> {
  try {
    const payload = await generateOverviewDiagram({
      repoFullName: fullName,
      structure: renderRepoStructure(tree),
      architectureSummary: architectureSummary ?? '',
    });
    if (!payload.mermaid?.trim()) return;
    setDiagram(repoId, 'overview', null, payload);
  } catch (err) {
    console.error(
      '[indexer] overview diagram failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
