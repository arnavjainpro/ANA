import { AsyncLocalStorage } from 'node:async_hooks';

// Carries the tenant id across a request's async call tree so deep service
// code (Claude, embeddings) can attribute usage without every function
// signature growing an ownerId parameter. Bound per request in index.ts.

interface UsageStore {
  ownerId: string;
}

const als = new AsyncLocalStorage<UsageStore>();

export function bindOwnerContext(ownerId: string, done: () => void): void {
  als.run({ ownerId }, done);
}

/** Reassign the owner mid-request (the completions route resolves its tenant
 *  from the conversation id after the request has already started). */
export function setContextOwner(ownerId: string): void {
  const store = als.getStore();
  if (store) store.ownerId = ownerId;
}

/** The current tenant id, or '' when unattributed (boot tasks, dev calls). */
export function currentOwner(): string {
  return als.getStore()?.ownerId ?? '';
}
