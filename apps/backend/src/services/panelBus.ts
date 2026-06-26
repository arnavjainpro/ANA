// In-process pub/sub bridging VOICE turns (Tavus -> /v1/chat/completions) to the
// desktop, which subscribes over /conversation/events. Events are discriminated
// by `type`: 'panel' renders a diagram/board; 'build-request' hands a spoken
// change to the desktop's Build pipeline to apply on disk.

import type { ConversationTurn, Mode } from '../lib/types.js';

export interface PanelEvent {
  type: 'panel';
  mode: Mode;
  spoken: string;
  panel: 'diagram' | 'whiteboard';
  payload: unknown;
}

export interface BuildRequestEvent {
  type: 'build-request';
  /** The user's spoken utterance for the desktop's Build pipeline to act on. */
  transcript: string;
  /** Prior conversation (from Tavus) so Build has the planning context. */
  history: ConversationTurn[];
}

export interface UndoRequestEvent {
  type: 'undo-request';
}

export interface RedoRequestEvent {
  type: 'redo-request';
}

export type BusEvent = PanelEvent | BuildRequestEvent | UndoRequestEvent | RedoRequestEvent;

type Listener = (event: BusEvent) => void;

const listeners = new Set<Listener>();

function emit(event: BusEvent): void {
  for (const listener of listeners) listener(event);
}

export function publishPanel(event: Omit<PanelEvent, 'type'>): void {
  emit({ type: 'panel', ...event });
}

/** Hand a voice change request to the desktop to apply on the local working copy. */
export function publishBuildRequest(transcript: string, history: ConversationTurn[]): void {
  emit({ type: 'build-request', transcript, history });
}

/** Ask the desktop to undo the last change applied this session. */
export function publishUndoRequest(): void {
  emit({ type: 'undo-request' });
}

/** Ask the desktop to redo the most recently undone change. */
export function publishRedoRequest(): void {
  emit({ type: 'redo-request' });
}

/** Subscribe to bus events; returns an unsubscribe function. */
export function subscribePanel(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
