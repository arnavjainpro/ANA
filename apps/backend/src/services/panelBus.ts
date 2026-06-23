// Tiny in-process pub/sub for right-panel updates produced by VOICE turns.
//
// Voice turns arrive via Tavus -> /v1/chat/completions, which returns only the
// spoken text to Tavus. The visual payload (Understand diagram / Plan board) has
// nowhere to go, so we publish it here; the desktop app subscribes over
// /conversation/events and renders it. In-app text turns don't need this — they
// already get the full result back from /conversation/turn.

import type { Mode } from '../lib/types.js';

export interface PanelEvent {
  mode: Mode;
  spoken: string;
  panel: 'diagram' | 'whiteboard';
  payload: unknown;
}

type Listener = (event: PanelEvent) => void;

const listeners = new Set<Listener>();

export function publishPanel(event: PanelEvent): void {
  for (const listener of listeners) listener(event);
}

/** Subscribe to panel events; returns an unsubscribe function. */
export function subscribePanel(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
