import { create } from 'zustand';
import type {
  ConversationTurn,
  DiagramPayload,
  DiagramScope,
  PanelEvent,
  TurnResult,
  WhiteboardPayload,
} from '../../types';

interface ConversationState {
  conversationUrl: string | null;
  conversationId: string | null;
  history: ConversationTurn[];
  processing: boolean;
  /** True from `conversation/start` being called until the session mounts. */
  sessionStarting: boolean;
  lastSpoken: string | null;
  diagram: DiagramPayload | null;
  /** The canonical master map, remembered so the "back to overview" breadcrumb
   *  can restore it after drilling into a detail map (which replaces `diagram`). */
  overviewDiagram: DiagramPayload | null;
  /** Which diagram view is showing: the whole map, a focused slice, or a
   *  per-component detail map. Drives the renderer's filter/zoom + breadcrumb. */
  diagramView: DiagramScope;
  /** The component a focus/detail view is about; null when showing the overview. */
  focusSubject: string | null;
  whiteboard: WhiteboardPayload | null;
  error: string | null;
  /** Latest spoken utterance from the live Tavus replica, with a monotonic
   *  sequence so consumers re-run even when the same text repeats. Drives
   *  real-time node highlighting as Ana speaks. */
  liveUtterance: { text: string; seq: number } | null;

  setConversation: (id: string, url: string) => void;
  /** Clear the active session (used when the user leaves the call). */
  clearConversation: () => void;
  setProcessing: (processing: boolean) => void;
  setSessionStarting: (starting: boolean) => void;
  /** Append a user turn, capped at the last 6 turns sent to the backend. */
  appendUserTurn: (content: string) => void;
  /** Append an assistant turn + set lastSpoken (used by Build mode replies). */
  pushAssistant: (content: string) => void;
  applyResult: (result: TurnResult) => void;
  /** Like applyResult but only updates the panel payload (no history append) —
   *  used for voice turns whose conversation history lives in Tavus, not here. */
  applyPanel: (result: PanelEvent) => void;
  /** Return to the full master map (the "back to overview" breadcrumb). */
  clearDiagramFocus: () => void;
  setError: (error: string | null) => void;
  /** Record a spoken utterance from the live replica (bumps the sequence). */
  pushUtterance: (text: string) => void;
}

/**
 * Keep the existing diagram object when the incoming map is byte-identical, so a
 * repeated view (the cached overview served again, a follow-up turn) doesn't get
 * a fresh object identity that re-runs the panel's render/highlight effects and
 * makes the diagram visibly churn. A genuinely new map replaces it as normal.
 */
function nextDiagram(prev: DiagramPayload | null, incoming: DiagramPayload): DiagramPayload {
  if (prev && prev.mermaid === incoming.mermaid) return prev;
  return incoming;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversationUrl: null,
  conversationId: null,
  history: [],
  processing: false,
  sessionStarting: false,
  lastSpoken: null,
  diagram: null,
  overviewDiagram: null,
  diagramView: 'overview',
  focusSubject: null,
  whiteboard: null,
  error: null,
  liveUtterance: null,

  setConversation: (conversationId, conversationUrl) =>
    set({ conversationId, conversationUrl }),
  clearConversation: () =>
    set({ conversationId: null, conversationUrl: null, liveUtterance: null }),
  setProcessing: (processing) => set({ processing }),
  setSessionStarting: (sessionStarting) => set({ sessionStarting }),
  appendUserTurn: (content) =>
    set((s) => ({ history: [...s.history, { role: 'user', content }] })),
  pushAssistant: (content) =>
    set((s) => ({
      lastSpoken: content,
      history: [...s.history, { role: 'assistant', content }],
    })),
  applyResult: (result) =>
    set((s) => {
      const isDiagram = result.panel === 'diagram';
      const payload = result.payload as DiagramPayload;
      return {
        lastSpoken: result.spoken,
        // The text path always returns a full overview.
        diagram: isDiagram ? nextDiagram(s.diagram, payload) : s.diagram,
        overviewDiagram: isDiagram ? nextDiagram(s.overviewDiagram, payload) : s.overviewDiagram,
        diagramView: isDiagram ? 'overview' : s.diagramView,
        focusSubject: isDiagram ? null : s.focusSubject,
        whiteboard:
          result.panel === 'whiteboard' ? (result.payload as WhiteboardPayload) : s.whiteboard,
        history: [...s.history, { role: 'assistant', content: result.spoken }],
      };
    }),
  applyPanel: (result) =>
    set((s) => {
      const isDiagram = result.panel === 'diagram';
      const view: DiagramScope = isDiagram ? result.view ?? 'overview' : s.diagramView;
      const payload = result.payload as DiagramPayload;
      return {
        lastSpoken: result.spoken,
        diagram: isDiagram ? nextDiagram(s.diagram, payload) : s.diagram,
        // Overview and focus both carry the master map as payload; remember it so
        // we can return to it after a detail drill-in. Detail leaves it untouched.
        overviewDiagram:
          isDiagram && view !== 'detail'
            ? nextDiagram(s.overviewDiagram, payload)
            : s.overviewDiagram,
        diagramView: view,
        focusSubject: isDiagram ? result.focusSubject ?? null : s.focusSubject,
        whiteboard:
          result.panel === 'whiteboard' ? (result.payload as WhiteboardPayload) : s.whiteboard,
      };
    }),
  clearDiagramFocus: () =>
    set((s) => ({
      // Restore the master map (it was replaced on disk by a detail drill-in).
      diagram: s.overviewDiagram ?? s.diagram,
      diagramView: 'overview',
      focusSubject: null,
    })),
  setError: (error) => set({ error }),
  pushUtterance: (text) =>
    set((s) => ({
      liveUtterance: { text, seq: (s.liveUtterance?.seq ?? 0) + 1 },
    })),
}));

/** The last 6 turns, as sent to the backend with every request. */
export function recentHistory(history: ConversationTurn[]): ConversationTurn[] {
  return history.slice(-6);
}
