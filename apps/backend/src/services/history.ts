// Per-session in-memory undo/redo stacks for Build mode, keyed by sessionId.
// Nothing is persisted — history lives only for the lifetime of the session.

import type { BuildOperation } from '../lib/types.js';

/** Maximum operations retained per session; oldest are dropped past this. */
const MAX_STACK_DEPTH = 50;

const undoStacks = new Map<string, BuildOperation[]>();
const redoStacks = new Map<string, BuildOperation[]>();

function pushTo(map: Map<string, BuildOperation[]>, sessionId: string, op: BuildOperation): void {
  const stack = map.get(sessionId) ?? [];
  stack.push(op);
  if (stack.length > MAX_STACK_DEPTH) {
    stack.splice(0, stack.length - MAX_STACK_DEPTH);
  }
  map.set(sessionId, stack);
}

function popFrom(map: Map<string, BuildOperation[]>, sessionId: string): BuildOperation | null {
  const stack = map.get(sessionId);
  if (!stack || stack.length === 0) return null;
  return stack.pop() ?? null;
}

/** Push a new (forward) operation onto the undo stack. */
export function push(sessionId: string, op: BuildOperation): void {
  pushTo(undoStacks, sessionId, op);
}

/** Pop the most recent operation (the one to undo), removing it. */
export function pop(sessionId: string): BuildOperation | null {
  return popFrom(undoStacks, sessionId);
}

/** Peek at the most recent operation without removing it. */
export function peek(sessionId: string): BuildOperation | null {
  const stack = undoStacks.get(sessionId);
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1] ?? null;
}

/** Push an undone operation onto the redo stack. */
export function pushRedo(sessionId: string, op: BuildOperation): void {
  pushTo(redoStacks, sessionId, op);
}

/** Pop the most recently undone operation (the one to redo). */
export function popRedo(sessionId: string): BuildOperation | null {
  return popFrom(redoStacks, sessionId);
}

/** Drop the redo stack — a fresh change makes prior undos un-redoable. */
export function clearRedo(sessionId: string): void {
  redoStacks.delete(sessionId);
}

/** Drop a session's entire history (called on session end). */
export function clear(sessionId: string): void {
  undoStacks.delete(sessionId);
  redoStacks.delete(sessionId);
}
