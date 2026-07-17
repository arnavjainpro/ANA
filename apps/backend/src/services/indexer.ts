import { getSupabase } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { chunkText } from '../lib/chunking.js';
import { isIndexable } from '../lib/fileFilter.js';
import { embedBatch } from './embeddings.js';
import { getRepo, getRepoTree, getFileContents } from './github.js';
import {
  generateArchitectureSummary,
  generateModuleSummaries,
  generateOverviewDiagram,
} from './claude.js';
import { renderRepoStructure, clearProjectMap } from './projectMap.js';
import { setArchitectureSummary, clearArchitectureSummary } from './architectureSummary.js';
import { setDiagram, invalidateRepo } from './diagramCache.js';
import {
  createModuleMapCollector,
  serializeModuleMap,
  setModuleMap,
  clearModuleMap,
  type ModuleMapCollector,
} from './moduleMap.js';
import type { ModuleMap, RepoTreeNode } from '../lib/types.js';

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
  ownerId = '',
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

  // Upsert the repo row (scoped per tenant) and get its id.
  let { data: repoRow, error: repoErr } = await supabase
    .from('repos')
    .upsert(
      {
        github_id: repo.id,
        full_name: repo.full_name,
        default_branch: repo.default_branch,
        size_kb: repo.size,
        owner_id: ownerId,
      },
      { onConflict: 'github_id,owner_id' },
    )
    .select('id')
    .single();

  // Pre-migration database (001_tenancy.sql not applied yet): retry the legacy
  // single-tenant upsert so indexing keeps working until the migration runs.
  if (repoErr?.message.includes('owner_id')) {
    ({ data: repoRow, error: repoErr } = await supabase
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
      .single());
  }

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
  // Collects per-file imports/heads alongside chunking (contents are already in
  // hand) to build the whole-repo module map after the loop.
  const collector = createModuleMapCollector();

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]!;
    onProgress({ processed: i, total, currentFile: file.path });
    try {
      const contents = await getFileContents(token, fullName, file.path);
      collector.addFile(file.path, contents);
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

  // Re-index invalidates the cached structure/summary/map/diagrams for this repo.
  clearProjectMap(fullName);
  clearArchitectureSummary(repoId);
  clearModuleMap(repoId);
  await invalidateRepo(repoId);

  // Structured whole-repo analysis: modules + import edges + entry points, with
  // one-line role summaries. Best-effort: a failure must not fail the index.
  const moduleMap = await buildModuleMap(repoId, tree, collector);

  // Generate and persist the one-time architecture overview. Best-effort: a
  // failure here must not fail the index (the chunks are already stored).
  const summary = await buildArchitectureSummary(token, fullName, repoId, tree);

  // Freeze the canonical overview diagrams (both depths) so every "explain the
  // architecture" — this session or the next — returns the identical map.
  await buildOverviewDiagrams(fullName, repoId, tree, summary, moduleMap);

  return { repoId, filesIndexed, chunksStored, filesSkipped };
}

/** Finalize the module map, summarise its modules, and persist it on the repo
 *  row (and the in-memory cache). Never throws. */
async function buildModuleMap(
  repoId: string,
  tree: RepoTreeNode[],
  collector: ModuleMapCollector,
): Promise<ModuleMap | undefined> {
  try {
    const map = collector.finalize(tree);
    if (map.modules.length === 0) return undefined;
    await generateModuleSummaries(map, (path) => collector.getHead(path));

    await getSupabase().from('repos').update({ module_map: map }).eq('id', repoId);
    setModuleMap(repoId, map);
    return map;
  } catch (err) {
    console.error('[indexer] module map failed:', err instanceof Error ? err.message : err);
    return undefined;
  }
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

/** Generate the canonical overview diagrams (basic AND deep) once and persist
 *  them, so every later "explain the architecture" — across sessions and
 *  restarts — reuses the identical maps. Each depth is independently
 *  best-effort. Never throws. */
async function buildOverviewDiagrams(
  fullName: string,
  repoId: string,
  tree: RepoTreeNode[],
  architectureSummary: string | undefined,
  moduleMap: ModuleMap | undefined,
): Promise<void> {
  const structure = renderRepoStructure(tree);
  const serializedMap = moduleMap ? serializeModuleMap(moduleMap) : undefined;

  for (const depth of ['basic', 'deep'] as const) {
    try {
      const payload = await generateOverviewDiagram({
        repoFullName: fullName,
        structure,
        architectureSummary: architectureSummary ?? '',
        depth,
        moduleMap: serializedMap,
      });
      if (!payload.mermaid?.trim()) continue;
      await setDiagram(repoId, 'overview', { depth }, payload);
    } catch (err) {
      console.error(
        `[indexer] ${depth} overview diagram failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
