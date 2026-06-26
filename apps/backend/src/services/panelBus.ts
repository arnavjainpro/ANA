// In-process pub/sub bridging VOICE turns (Tavus -> /v1/chat/completions) to the
// desktop, which subscribes over /conversation/events. Events are discriminated
// by `type`: 'panel' renders a diagram/board; 'build-request' hands a spoken
// change to the desktop's Build pipeline to apply on disk.

import type { Mode } from '../lib/types.js';

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
}

export type BusEvent = PanelEvent | BuildRequestEvent;

type Listener = (event: BusEvent) => void;

const listeners = new Set<Listener>();

function emit(event: BusEvent): void {
  for (const listener of listeners) listener(event);
}

export function publishPanel(event: Omit<PanelEvent, 'type'>): void {
  emit({ type: 'panel', ...event });
}

/** Hand a voice change request to the desktop to apply on the local working copy. */
export function publishBuildRequest(transcript: string): void {
  emit({ type: 'build-request', transcript });
}

/** Subscribe to bus events; returns an unsubscribe function. */
export function subscribePanel(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
