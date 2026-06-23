import { ipcMain } from 'electron';
import { backendJson } from '../lib/backend.js';
import { loadGitHubToken } from '../lib/tokenStore.js';
import type { IpcResult, TurnRequest, TurnResult } from '../../types.js';

/** Tell the backend which repo is active so Tavus voice turns get its RAG context. */
async function announceActiveRepo(repoId: string, repoFullName?: string): Promise<void> {
  const token = await loadGitHubToken();
  await backendJson('/conversation/active-repo', {
    method: 'POST',
    body: JSON.stringify({ repoId, repoFullName }),
    githubToken: token ?? undefined,
  });
}

// The Tavus account has a hard cap on concurrent conversations, so we must end a
// session when it is replaced or the app quits — otherwise sessions leak and new
// starts fail with "maximum concurrent conversations". The main process owns the
// id (the renderer can be torn down without a chance to clean up).
let activeConversationId: string | null = null;

/** Whether a Tavus conversation is currently tracked (needs cleanup on quit). */
export function hasActiveConversation(): boolean {
  return activeConversationId !== null;
}

/** End the tracked Tavus conversation (if any). Safe to call repeatedly. */
export async function endActiveConversation(): Promise<void> {
  const id = activeConversationId;
  if (!id) return;
  activeConversationId = null;
  await backendJson('/conversation/end', {
    method: 'POST',
    body: JSON.stringify({ conversationId: id }),
  }).catch(() => undefined);
}

export function registerConversationIpc(): void {
  ipcMain.handle(
    'conversation:start',
    async (): Promise<IpcResult<{ conversationId: string; conversationUrl: string }>> => {
      try {
        // Never hold two sessions at once — drop the previous before starting.
        await endActiveConversation();
        const result = await backendJson<{ conversationId: string; conversationUrl: string }>(
          '/conversation/start',
          { method: 'POST', body: '{}' },
        );
        activeConversationId = result.conversationId;
        return result;
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not start conversation.' };
      }
    },
  );

  // Explicit end (e.g. the renderer ending a session). Idempotent.
  ipcMain.handle(
    'conversation:end',
    async (_e, conversationId?: string): Promise<IpcResult<{ ok: true }>> => {
      try {
        if (conversationId && conversationId === activeConversationId) {
          activeConversationId = null;
        }
        await backendJson('/conversation/end', {
          method: 'POST',
          body: JSON.stringify({ conversationId: conversationId ?? null }),
        });
        return { ok: true };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not end conversation.' };
      }
    },
  );

  ipcMain.handle(
    'conversation:turn',
    async (_e, req: TurnRequest): Promise<IpcResult<TurnResult>> => {
      try {
        const token = await loadGitHubToken();
        // Keep the backend's "active repo" in sync so voice (Tavus) turns get
        // the same RAG context as in-app turns.
        if (req.repoId) {
          void announceActiveRepo(req.repoId, req.repoFullName).catch(() => undefined);
        }
        return await backendJson<TurnResult>('/conversation/turn', {
          method: 'POST',
          body: JSON.stringify(req),
          githubToken: token ?? undefined,
        });
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Turn processing failed.' };
      }
    },
  );

  // Explicit re-sync triggered by the "Refresh context" button after indexing,
  // so the user can immediately talk to a now-repo-aware Ana.
  ipcMain.handle(
    'conversation:syncRepo',
    async (
      _e,
      args: { repoId: string; repoFullName?: string },
    ): Promise<IpcResult<{ ok: true }>> => {
      try {
        if (!args?.repoId) return { error: 'No repository to sync.' };
        await announceActiveRepo(args.repoId, args.repoFullName);
        return { ok: true };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not refresh context.' };
      }
    },
  );
}
