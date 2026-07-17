// Tracks, per tenant, which repo the desktop client is currently working in,
// so the OpenAI-compatible /v1/chat/completions endpoint (called directly by
// Tavus, which cannot pass a repoId) can run RAG retrieval against the right
// repo for the right user.
//
// Also maps live Tavus conversation ids to their owner, registered when the
// authenticated /conversation/start route creates one. The completions route
// resolves its caller through that map (conversation_id in the request body
// when Tavus provides it), with a sole-live-owner fallback that fails closed:
// if more than one owner has a live conversation and the request carries no
// id, no repo context is used rather than risking another tenant's code.
//
// In-memory only: the desktop app re-announces the active repo on index and on
// every text turn, so this is repopulated naturally after a backend restart.

export interface ActiveRepo {
  repoId: string;
  repoFullName?: string;
  /** GitHub token for on-demand file fetches during a turn (optional). */
  githubToken?: string;
}

const activeByOwner = new Map<string, ActiveRepo>();

interface ConversationEntry {
  ownerId: string;
  createdAt: number;
}

const conversations = new Map<string, ConversationEntry>();

// Entries older than this are swept so a lost /conversation/end cannot pin an
// owner mapping forever.
const CONVERSATION_TTL_MS = 4 * 60 * 60 * 1000;

function sweep(): void {
  const cutoff = Date.now() - CONVERSATION_TTL_MS;
  for (const [id, entry] of conversations) {
    if (entry.createdAt < cutoff) conversations.delete(id);
  }
}

export function setActiveRepo(ownerId: string, repo: ActiveRepo): void {
  activeByOwner.set(ownerId, repo);
}

export function getActiveRepo(ownerId: string): ActiveRepo | null {
  return activeByOwner.get(ownerId) ?? null;
}

/** Forget the owner's active repo (fresh app launch, or switching repos). */
export function clearActiveRepo(ownerId: string): void {
  activeByOwner.delete(ownerId);
}

/** Record a live Tavus conversation as belonging to an owner. */
export function registerConversation(conversationId: string, ownerId: string): void {
  sweep();
  conversations.set(conversationId, { ownerId, createdAt: Date.now() });
}

export function unregisterConversation(conversationId: string): void {
  conversations.delete(conversationId);
}

/** The owner a Tavus conversation belongs to, if registered. */
export function ownerForConversation(conversationId: string): string | null {
  return conversations.get(conversationId)?.ownerId ?? null;
}

/**
 * When exactly one owner has live conversations, return that owner. Lets the
 * completions route work when Tavus omits a conversation id, without ever
 * guessing between two tenants.
 */
export function soleLiveOwner(): string | null {
  sweep();
  const owners = new Set<string>();
  for (const entry of conversations.values()) owners.add(entry.ownerId);
  if (owners.size === 1) return owners.values().next().value ?? null;
  return null;
}

/** Live conversation ids registered for one owner (for per-owner cleanup). */
export function conversationsForOwner(ownerId: string): string[] {
  sweep();
  const ids: string[] = [];
  for (const [id, entry] of conversations) {
    if (entry.ownerId === ownerId) ids.push(id);
  }
  return ids;
}
