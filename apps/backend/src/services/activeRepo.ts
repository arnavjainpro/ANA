// Tracks which repo the desktop client is currently working in, so the
// OpenAI-compatible /v1/chat/completions endpoint (called directly by Tavus,
// which cannot pass a repoId) can run RAG retrieval against the right repo.
//
// In-memory only: the desktop app re-announces the active repo on index and on
// every text turn, so this is repopulated naturally after a backend restart.

export interface ActiveRepo {
  repoId: string;
  repoFullName?: string;
  /** GitHub token for on-demand file fetches during a turn (optional). */
  githubToken?: string;
}

let active: ActiveRepo | null = null;

export function setActiveRepo(repo: ActiveRepo): void {
  active = repo;
}

export function getActiveRepo(): ActiveRepo | null {
  return active;
}

/** Forget the active repo (e.g. fresh app launch, or switching repos) so Ana
 *  doesn't answer from a stale project the user didn't select this session. */
export function clearActiveRepo(): void {
  active = null;
}
