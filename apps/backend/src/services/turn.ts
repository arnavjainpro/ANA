import {
  classifyIntent,
  generateResponse,
  generateBuildResponse,
  SPOKEN_FALLBACK,
} from './claude.js';
import { retrieveChunks } from './retrieval.js';
import { getFileContents } from './github.js';
import { validatePatches, generateOperationId } from './builder.js';
import * as history from './history.js';
import type {
  AnaResponse,
  BuildPlan,
  BuildResult,
  BuildTurnRequest,
  IntentClassification,
  Mode,
  RetrievedChunk,
  TurnRequest,
  UndoResult,
} from '../lib/types.js';
import { SUPPORTED_MODES } from '../lib/types.js';

export interface TurnResult extends AnaResponse {
  mode: Mode;
}

/** Spoken reply when Ana can't apply a change but it isn't an outright error. */
const BUILD_FALLBACK = "I couldn't make that change just now — can you try rephrasing it?";

/**
 * Process a single conversation turn end-to-end (spec §2 / §6):
 * Call 1 (intent) → context assembly (RAG + optional file) → Call 2 (reasoning).
 * On any Claude failure, return a spoken fallback rather than throwing so Ana
 * always says something.
 */
export async function processTurn(
  req: TurnRequest,
  options: { githubToken?: string; repoFullName?: string; precomputedIntent?: IntentClassification },
): Promise<TurnResult> {
  const history = req.history ?? [];

  try {
    // Reuse the caller's classification when given (voice turns classify up
    // front to branch Build vs speak) so we don't pay for a second Haiku call.
    const intent = options.precomputedIntent ?? (await classifyIntent(req.utterance, history));

    // Resolve the effective mode: a manual override from the UI wins, otherwise
    // use the classifier. Only Understand/Plan are supported this build.
    let mode: Mode = req.forcedMode ?? intent.mode;
    if (!SUPPORTED_MODES.includes(mode)) {
      mode = 'Understand';
    }

    const chunks = await retrieveChunks(req.repoId, req.utterance);

    // If the user named a file, fetch its full contents for Call 2 context.
    let fileContents: { path: string; contents: string } | undefined;
    const targetPath = req.filePath ?? intent.target ?? undefined;
    if (targetPath && options.githubToken && options.repoFullName && targetPath.includes('.')) {
      try {
        const contents = await getFileContents(
          options.githubToken,
          options.repoFullName,
          targetPath,
        );
        fileContents = { path: targetPath, contents };
      } catch {
        // Non-fatal: proceed without the file's contents.
      }
    }

    const response = await generateResponse({
      mode,
      utterance: req.utterance,
      intent,
      chunks,
      history,
      fileContents,
    });

    return { ...response, mode };
  } catch (err) {
    console.error('[turn] processing failed:', err instanceof Error ? err.message : err);
    return {
      mode: req.forcedMode ?? 'Understand',
      spoken: SPOKEN_FALLBACK,
      panel: 'diagram',
      payload: { mermaid: 'graph TD; A[Not enough context]' },
    };
  }
}

/**
 * Pick the most likely target files for a Build change: the file the user named
 * (if any), then the highest-similarity RAG chunk paths, capped at 5.
 */
function candidateTargets(intentTarget: string | null, chunks: RetrievedChunk[]): string[] {
  const targets: string[] = [];
  if (intentTarget && intentTarget.includes('.')) targets.push(intentTarget);
  for (const chunk of chunks) {
    if (!targets.includes(chunk.filePath)) targets.push(chunk.filePath);
    if (targets.length >= 5) break;
  }
  return targets.slice(0, 5);
}

/**
 * Phase 1 of a Build turn: classify intent + RAG to pick the most likely target
 * file paths, which the client then reads from its local working copy before the
 * reasoning call (phase 2). Never throws — returns no paths on failure.
 */
export async function planBuildTurn(req: BuildTurnRequest): Promise<BuildPlan> {
  try {
    const intent = await classifyIntent(req.transcript, req.history ?? []);
    const chunks = req.repoId ? await retrieveChunks(req.repoId, req.transcript) : [];
    return { paths: candidateTargets(intent.target, chunks) };
  } catch (err) {
    console.error('[build] planning failed:', err instanceof Error ? err.message : err);
    return { paths: [] };
  }
}

/**
 * Process a Build-mode turn: classify → assemble context (RAG + full target
 * file contents) → reasoning → validate → record on the undo stack. Returns the
 * patches for the client to apply atomically to disk. Never throws — on any
 * failure Ana returns a spoken fallback with zero patches.
 */
export async function processBuildTurn(
  req: BuildTurnRequest,
  options: { githubToken?: string },
): Promise<BuildResult> {
  const historyTurns = req.history ?? [];

  try {
    const intent = await classifyIntent(req.transcript, historyTurns);
    const chunks = req.repoId ? await retrieveChunks(req.repoId, req.transcript) : [];

    // Ground truth Ana edits. Prefer the local working-copy contents the client
    // read from disk (so each patch's `original` matches disk exactly); only
    // legacy callers that didn't supply files fall back to fetching from GitHub.
    let files: { path: string; contents: string }[];
    if (req.files) {
      files = req.files;
    } else {
      files = [];
      const targets = candidateTargets(intent.target, chunks);
      if (options.githubToken && req.repoFullName) {
        for (const path of targets) {
          try {
            const contents = await getFileContents(options.githubToken, req.repoFullName, path);
            files.push({ path, contents });
          } catch {
            // Non-fatal: skip a target we can't read.
          }
        }
      }
    }

    const response = await generateBuildResponse({
      utterance: req.transcript,
      intent,
      chunks,
      history: historyTurns,
      files,
    });

    // Ana intentionally produced no patches (clarifying question or refusal).
    if (!response.patches || response.patches.length === 0) {
      return { spoken: response.spoken || BUILD_FALLBACK, patches: [], operationId: '' };
    }

    const validation = await validatePatches(response.patches);
    if (!validation.valid) {
      return { spoken: validation.reason ?? BUILD_FALLBACK, patches: [], operationId: '' };
    }

    const first = response.patches[0];
    if (!first) {
      return { spoken: response.spoken || BUILD_FALLBACK, patches: [], operationId: '' };
    }
    const summary =
      response.patches.length === 1
        ? first.summary
        : `${first.summary} (${response.patches.length} files)`;

    const operationId = generateOperationId();
    history.push(req.sessionId, {
      operationId,
      timestamp: Date.now(),
      patches: response.patches,
      summary,
    });

    return { spoken: response.spoken, patches: response.patches, operationId };
  } catch (err) {
    console.error('[build] processing failed:', err instanceof Error ? err.message : err);
    return { spoken: SPOKEN_FALLBACK, patches: [], operationId: '' };
  }
}

/**
 * Pop the most recent operation for a session and return its patches reversed
 * (original ↔ updated) so the client can roll the change back on disk.
 */
export function undoBuild(sessionId: string): UndoResult {
  const op = history.pop(sessionId);
  if (!op) return { spoken: 'There is nothing to undo.', patches: [] };
  const reversed = op.patches.map((patch) => ({
    ...patch,
    original: patch.updated,
    updated: patch.original,
  }));
  return { spoken: 'Undone.', patches: reversed };
}

/** Drop a session's undo history (called when the session ends). */
export function endBuildSession(sessionId: string): void {
  history.clear(sessionId);
}
