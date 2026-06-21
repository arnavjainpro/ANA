import { classifyIntent, generateResponse, SPOKEN_FALLBACK } from './claude.js';
import { retrieveChunks } from './retrieval.js';
import { getFileContents } from './github.js';
import type { AnaResponse, Mode, TurnRequest } from '../lib/types.js';
import { SUPPORTED_MODES } from '../lib/types.js';

export interface TurnResult extends AnaResponse {
  mode: Mode;
}

/**
 * Process a single conversation turn end-to-end (spec §2 / §6):
 * Call 1 (intent) → context assembly (RAG + optional file) → Call 2 (reasoning).
 * On any Claude failure, return a spoken fallback rather than throwing so Ana
 * always says something.
 */
export async function processTurn(
  req: TurnRequest,
  options: { githubToken?: string; repoFullName?: string },
): Promise<TurnResult> {
  const history = req.history ?? [];

  try {
    const intent = await classifyIntent(req.utterance, history);

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
