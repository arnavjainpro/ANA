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
import { getModuleMap, moduleContextFor, serializeModuleMap } from './moduleMap.js';
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

// The component the user is currently looking at, per repo. Lets a follow-up
// like "now show it in depth" (which names no part) resolve to the part already
// in view. Cleared when the user returns to the whole-project overview.
const lastSubject = new Map<string, string>();

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
  // A focus/detail follow-up that doesn't re-name the part falls back to the
  // part already in view.
  let subject = intent.diagramSubject?.trim() || null;
  if ((scope === 'focus' || scope === 'detail') && !subject) {
    subject = lastSubject.get(repoId) ?? null;
  }

  if (scope === 'detail' && subject) {
    lastSubject.set(repoId, subject);
    return resolveDetail(repoId, subject);
  }

  // Focus zooms into the simple (basic) overview; an explicit "in-depth overall"
  // request asks for the deep overview. Default is the basic map.
  const depth: DiagramDepth = scope === 'focus' ? 'basic' : intent.diagramDepth ?? 'basic';
  const overview = await getOrBuildOverview(options, depth);
  if (!overview) return null;
  if (scope === 'focus' && subject) {
    lastSubject.set(repoId, subject);
    return { payload: overview, view: 'focus', focusSubject: subject };
  }
  // Back to the whole project — forget the part we were looking at.
  lastSubject.delete(repoId);
  return { payload: overview, view: 'overview', focusSubject: null };
}

/** Serve a cached detail map, or generate one once from subject-scoped RAG
 *  plus the subject's module-map slice. */
async function resolveDetail(repoId: string, subject: string): Promise<DiagramView | null> {
  const cached = await getDiagram(repoId, 'detail', { subject });
  if (cached) return { payload: cached, view: 'detail', focusSubject: subject };

  try {
    const [chunks, moduleMap] = await Promise.all([
      retrieveChunks(repoId, subject),
      getModuleMap(repoId),
    ]);
    const payload = await generateDetailDiagram({
      subject,
      chunks,
      moduleContext: moduleMap ? moduleContextFor(moduleMap, subject) : undefined,
    });
    if (!payload.mermaid?.trim()) return null;
    // Fire-and-forget persist: the voice path must stay inside its latency
    // budget; a failed write only costs cross-restart reuse.
    void setDiagram(repoId, 'detail', { subject }, payload);
    return { payload, view: 'detail', focusSubject: subject };
  } catch (err) {
    console.error('[diagram] detail generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Return the frozen overview for the requested depth. Both depths are generated
 * and persisted at index time; the cache read here is DB-backed, so a backend
 * restart serves the identical map. The lazy build below only runs for repos
 * indexed before this feature (using the persisted module map when available),
 * and its result is persisted so it too becomes canonical.
 */
async function getOrBuildOverview(
  options: ResolveDiagramOptions,
  depth: DiagramDepth,
): Promise<DiagramPayload | null> {
  const { repoId, repoFullName, githubToken } = options;
  const cached = await getDiagram(repoId, 'overview', { depth });
  if (cached) return cached;

  try {
    const [architectureSummary, structure, moduleMap] = await Promise.all([
      getArchitectureSummary(repoId),
      repoFullName && githubToken
        ? getProjectMap(repoFullName, githubToken)
        : Promise.resolve(undefined),
      getModuleMap(repoId),
    ]);
    const payload = await generateOverviewDiagram({
      repoFullName: repoFullName ?? 'this repository',
      structure: structure ?? '',
      architectureSummary: architectureSummary ?? '',
      depth,
      moduleMap: moduleMap ? serializeModuleMap(moduleMap) : undefined,
    });
    if (!payload.mermaid?.trim()) return null;
    void setDiagram(repoId, 'overview', { depth }, payload);
    return payload;
  } catch (err) {
    console.error('[diagram] overview build failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
