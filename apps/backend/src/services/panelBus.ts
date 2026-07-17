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

// Listeners are keyed by tenant so one user's desktop never receives another
// user's panel or build events.
const listenersByOwner = new Map<string, Set<Listener>>();

function emit(ownerId: string, event: BusEvent): void {
  const set = listenersByOwner.get(ownerId);
  if (!set) return;
  for (const listener of set) listener(event);
}

export function publishPanel(ownerId: string, event: Omit<PanelEvent, 'type'>): void {
  emit(ownerId, { type: 'panel', ...event });
}

/** Hand a voice change request to the desktop to apply on the local working copy. */
export function publishBuildRequest(
  ownerId: string,
  transcript: string,
  history: ConversationTurn[],
): void {
  emit(ownerId, { type: 'build-request', transcript, history });
}

/** Ask the desktop to undo the last change applied this session. */
export function publishUndoRequest(ownerId: string): void {
  emit(ownerId, { type: 'undo-request' });
}

/** Ask the desktop to redo the most recently undone change. */
export function publishRedoRequest(ownerId: string): void {
  emit(ownerId, { type: 'redo-request' });
}

/** Hand a new-project request to the desktop (scaffold → folder → repo → push). */
export function publishCreateProjectRequest(
  ownerId: string,
  transcript: string,
  history: ConversationTurn[],
): void {
  emit(ownerId, { type: 'create-project-request', transcript, history });
}

/** Ask the desktop to launch or stop the currently connected project. */
export function publishRunRequest(ownerId: string, action: 'launch' | 'stop'): void {
  emit(ownerId, { type: 'run-request', action });
}

/** Ask the desktop to run a shell command in the integrated terminal. */
export function publishTerminalRequest(ownerId: string, command: string): void {
  emit(ownerId, { type: 'terminal-request', command });
}

/** Subscribe to one tenant's bus events; returns an unsubscribe function. */
export function subscribePanel(ownerId: string, listener: Listener): () => void {
  let set = listenersByOwner.get(ownerId);
  if (!set) {
    set = new Set();
    listenersByOwner.set(ownerId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listenersByOwner.delete(ownerId);
  };
}
