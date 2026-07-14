// In-process pub/sub bridging VOICE turns (Tavus -> /v1/chat/completions) to the
// desktop, which subscribes over /conversation/events. Events are discriminated
// by `type`: 'panel' renders a diagram/board; 'build-request' hands a spoken
// change to the desktop's Build pipeline to apply on disk.

import type { ConversationTurn, DiagramScope, Mode } from '../lib/types.js';

export interface PanelEvent {
  type: 'panel';
  mode: Mode;
  spoken: string;
  panel: 'diagram' | 'whiteboard';
  payload: unknown;
  /** For diagram panels: which view this payload represents. The renderer uses
   *  it to decide between showing the master map, filtering it to a focus
   *  subject, or swapping to a detail map. Absent for whiteboard panels. */
  view?: DiagramScope;
  /** The node/component the focus or detail view is about; null for overview. */
  focusSubject?: string | null;
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

/** Ask the desktop to scaffold + publish a brand-new project from the utterance. */
export interface CreateProjectRequestEvent {
  type: 'create-project-request';
  transcript: string;
  history: ConversationTurn[];
}

/** Ask the desktop to launch or stop the current project. */
export interface RunRequestEvent {
  type: 'run-request';
  action: 'launch' | 'stop';
}

/** Ask the desktop to run a shell command in the integrated terminal. */
export interface TerminalRequestEvent {
  type: 'terminal-request';
  command: string;
}

export type BusEvent =
  | PanelEvent
  | BuildRequestEvent
  | UndoRequestEvent
  | RedoRequestEvent
  | CreateProjectRequestEvent
  | RunRequestEvent
  | TerminalRequestEvent;

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

/** Hand a new-project request to the desktop (scaffold → folder → repo → push). */
export function publishCreateProjectRequest(
  transcript: string,
  history: ConversationTurn[],
): void {
  emit({ type: 'create-project-request', transcript, history });
}

/** Ask the desktop to launch or stop the currently connected project. */
export function publishRunRequest(action: 'launch' | 'stop'): void {
  emit({ type: 'run-request', action });
}

/** Ask the desktop to run a shell command in the integrated terminal. */
export function publishTerminalRequest(command: string): void {
  emit({ type: 'terminal-request', command });
}

/** Subscribe to bus events; returns an unsubscribe function. */
export function subscribePanel(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
