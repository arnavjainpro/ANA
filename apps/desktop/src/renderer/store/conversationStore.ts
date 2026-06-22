import { create } from 'zustand';
import type {
  ConversationTurn,
  DiagramPayload,
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
  whiteboard: WhiteboardPayload | null;
  error: string | null;

  setConversation: (id: string, url: string) => void;
  setProcessing: (processing: boolean) => void;
  setSessionStarting: (starting: boolean) => void;
  /** Append a user turn, capped at the last 6 turns sent to the backend. */
  appendUserTurn: (content: string) => void;
  /** Append an assistant turn + set lastSpoken (used by Build mode replies). */
  pushAssistant: (content: string) => void;
  applyResult: (result: TurnResult) => void;
  setError: (error: string | null) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversationUrl: null,
  conversationId: null,
  history: [],
  processing: false,
  sessionStarting: false,
  lastSpoken: null,
  diagram: null,
  whiteboard: null,
  error: null,

  setConversation: (conversationId, conversationUrl) =>
    set({ conversationId, conversationUrl }),
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
    set((s) => ({
      lastSpoken: result.spoken,
      diagram: result.panel === 'diagram' ? (result.payload as DiagramPayload) : s.diagram,
      whiteboard:
        result.panel === 'whiteboard' ? (result.payload as WhiteboardPayload) : s.whiteboard,
      history: [...s.history, { role: 'assistant', content: result.spoken }],
    })),
  setError: (error) => set({ error }),
}));

/** The last 6 turns, as sent to the backend with every request. */
export function recentHistory(history: ConversationTurn[]): ConversationTurn[] {
  return history.slice(-6);
}
