// Decides which diagram a voice turn should show — and crucially, when NOT to
// redraw at all. This is what keeps the diagram stable: follow-up turns return
// null (hold the current view), and every concrete view is served from the
// frozen cache or generated once and then cached.
//
//   wantsDiagram === false        -> null (keep what's on screen)
//   scope 'overview'              -> cached master map
//   scope 'focus' + subject       -> cached master map + a focusSubject marker
//                                    (the renderer filters/zooms; no new drawing)
//   scope 'detail' + subject      -> per-subject deep-dive map (cache or generate-once)

import { getDiagram, setDiagram } from './diagramCache.js';
import { generateOverviewDiagram, generateDetailDiagram } from './claude.js';
import { retrieveChunks } from './retrieval.js';
import { getArchitectureSummary } from './architectureSummary.js';
import { getProjectMap } from './projectMap.js';
import type {
  DiagramDepth,
  DiagramPayload,
  DiagramScope,
  IntentClassification,
} from '../lib/types.js';

export interface DiagramView {
  payload: DiagramPayload;
  view: DiagramScope;
  focusSubject: string | null;
}

export interface ResolveDiagramOptions {
  repoId: string;
  repoFullName?: string;
  githubToken?: string;
  intent: IntentClassification;
}

/**
 * Resolve the diagram view for a turn, or null when the diagram should not
 * change. Never throws — on any generation failure it returns null so the
 * current view simply stays put and Ana still speaks.
 */
export async function resolveDiagramView(
  options: ResolveDiagramOptions,
): Promise<DiagramView | null> {
  const { repoId, intent } = options;
  if (!intent.wantsDiagram) return null;

  const scope: DiagramScope = intent.diagramScope ?? 'overview';
  const subject = intent.diagramSubject?.trim() || null;

  if (scope === 'detail' && subject) {
    return resolveDetail(repoId, subject);
  }

  // Focus zooms into the simple (basic) overview; an explicit "in-depth overall"
  // request asks for the deep overview. Default is the basic map.
  const depth: DiagramDepth = scope === 'focus' ? 'basic' : intent.diagramDepth ?? 'basic';
  const overview = await getOrBuildOverview(options, depth);
  if (!overview) return null;
  if (scope === 'focus' && subject) {
    return { payload: overview, view: 'focus', focusSubject: subject };
  }
  return { payload: overview, view: 'overview', focusSubject: null };
}

/** Serve a cached detail map, or generate one once from subject-scoped RAG. */
async function resolveDetail(repoId: string, subject: string): Promise<DiagramView | null> {
  const cached = getDiagram(repoId, 'detail', { subject });
  if (cached) return { payload: cached, view: 'detail', focusSubject: subject };

  try {
    const chunks = await retrieveChunks(repoId, subject);
    const payload = await generateDetailDiagram({ subject, chunks });
    if (!payload.mermaid?.trim()) return null;
    setDiagram(repoId, 'detail', { subject }, payload);
    return { payload, view: 'detail', focusSubject: subject };
  } catch (err) {
    console.error('[diagram] detail generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Return the frozen overview for the requested depth. The basic overview is
 * generated at index time; the deep overview (and, for repos indexed before this
 * feature, a missing basic one) is built lazily here from the same
 * architecture-summary + structure inputs, then cached.
 */
async function getOrBuildOverview(
  options: ResolveDiagramOptions,
  depth: DiagramDepth,
): Promise<DiagramPayload | null> {
  const { repoId, repoFullName, githubToken } = options;
  const cached = getDiagram(repoId, 'overview', { depth });
  if (cached) return cached;

  try {
    const [architectureSummary, structure] = await Promise.all([
      getArchitectureSummary(repoId),
      repoFullName && githubToken
        ? getProjectMap(repoFullName, githubToken)
        : Promise.resolve(undefined),
    ]);
    const payload = await generateOverviewDiagram({
      repoFullName: repoFullName ?? 'this repository',
      structure: structure ?? '',
      architectureSummary: architectureSummary ?? '',
      depth,
    });
    if (!payload.mermaid?.trim()) return null;
    setDiagram(repoId, 'overview', { depth }, payload);
    return payload;
  } catch (err) {
    console.error('[diagram] overview build failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
