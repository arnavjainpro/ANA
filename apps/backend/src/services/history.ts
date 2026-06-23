// Per-session in-memory undo stack for Build mode. Sessions are keyed by
// sessionId. Nothing is persisted to disk or the database — undo history lives
// only for the lifetime of the process / session.

import type { BuildOperation } from '../lib/types.js';

/** Maximum operations retained per session; oldest are dropped past this. */
const MAX_STACK_DEPTH = 50;

const stacks = new Map<string, BuildOperation[]>();

/** Push an operation onto a session's stack, trimming to MAX_STACK_DEPTH. */
export function push(sessionId: string, op: BuildOperation): void {
  const stack = stacks.get(sessionId) ?? [];
  stack.push(op);
  if (stack.length > MAX_STACK_DEPTH) {
    stack.splice(0, stack.length - MAX_STACK_DEPTH);
  }
  stacks.set(sessionId, stack);
}

/** Pop the most recent operation (the one to undo), removing it. */
export function pop(sessionId: string): BuildOperation | null {
  const stack = stacks.get(sessionId);
  if (!stack || stack.length === 0) return null;
  return stack.pop() ?? null;
}

/** Peek at the most recent operation without removing it. */
export function peek(sessionId: string): BuildOperation | null {
  const stack = stacks.get(sessionId);
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1] ?? null;
}

/** Drop a session's entire stack (called on session end). */
export function clear(sessionId: string): void {
  stacks.delete(sessionId);
}
