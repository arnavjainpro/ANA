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
  lastSpoken: string | null;
  diagram: DiagramPayload | null;
  whiteboard: WhiteboardPayload | null;
  error: string | null;

  setConversation: (id: string, url: string) => void;
  setProcessing: (processing: boolean) => void;
  /** Append a user turn, capped at the last 6 turns sent to the backend. */
  appendUserTurn: (content: string) => void;
  applyResult: (result: TurnResult) => void;
  setError: (error: string | null) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversationUrl: null,
  conversationId: null,
  history: [],
  processing: false,
  lastSpoken: null,
  diagram: null,
  whiteboard: null,
  error: null,

  setConversation: (conversationId, conversationUrl) =>
    set({ conversationId, conversationUrl }),
  setProcessing: (processing) => set({ processing }),
  appendUserTurn: (content) =>
    set((s) => ({ history: [...s.history, { role: 'user', content }] })),
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
