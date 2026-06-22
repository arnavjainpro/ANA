import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { backendJson, backendUrl } from '../lib/backend.js';
import { loadGitHubToken } from '../lib/tokenStore.js';
import type {
  IpcResult,
  IndexDone,
  IndexProgress,
  RepoSummary,
  RepoTreeNode,
} from '../../types.js';

async function requireToken(): Promise<string> {
  const token = await loadGitHubToken();
  if (!token) throw new Error('Not connected to GitHub.');
  return token;
}

export function registerRepoIpc(): void {
  ipcMain.handle('repo:list', async (): Promise<IpcResult<{ repos: RepoSummary[] }>> => {
    try {
      const token = await requireToken();
      return await backendJson<{ repos: RepoSummary[] }>('/repo/list', { githubToken: token });
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list repos.' };
    }
  });

  ipcMain.handle(
    'repo:tree',
    async (
      _e,
      fullName: string,
      branch: string,
    ): Promise<IpcResult<{ tree: RepoTreeNode[] }>> => {
      try {
        const token = await requireToken();
        return await backendJson<{ tree: RepoTreeNode[] }>('/repo/tree', {
          method: 'POST',
          body: JSON.stringify({ fullName, branch }),
          githubToken: token,
        });
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Failed to fetch tree.' };
      }
    },
  );

  // Index a repo, relaying NDJSON progress lines to the renderer as they stream.
  ipcMain.handle(
    'repo:index',
    async (event: IpcMainInvokeEvent, fullName: string): Promise<IpcResult<IndexDone>> => {
      try {
        const token = await requireToken();
        const res = await fetch(backendUrl('/repo/index'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-github-token': token },
          body: JSON.stringify({ fullName }),
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '');
          return { error: `Indexing failed (${res.status}): ${text.slice(0, 200)}` };
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done: IndexDone | null = null;
        let streamError: string | null = null;

        for (;;) {
          const { value, done: finished } = await reader.read();
          if (finished) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const msg = JSON.parse(line) as
              | ({ type: 'progress' } & IndexProgress)
              | ({ type: 'done' } & IndexDone)
              | { type: 'error'; error: string };
            if (msg.type === 'progress') {
              const progress: IndexProgress = {
                processed: msg.processed,
                total: msg.total,
                currentFile: msg.currentFile,
              };
              event.sender.send('repo:index-progress', progress);
            } else if (msg.type === 'done') {
              done = {
                repoId: msg.repoId,
                filesIndexed: msg.filesIndexed,
                chunksStored: msg.chunksStored,
                filesSkipped: msg.filesSkipped,
              };
            } else if (msg.type === 'error') {
              streamError = msg.error;
            }
          }
        }

        if (streamError) return { error: streamError };
        if (!done) return { error: 'Indexing finished without a result.' };
        return done;
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Indexing failed.' };
      }
    },
  );

  // Fetch file contents
  ipcMain.handle(
    'repo:file',
    async (_e, fullName: string, filePath: string): Promise<IpcResult<{ content: string }>> => {
      try {
        const token = await requireToken();
        return await backendJson<{ content: string }>('/repo/file', {
          method: 'POST',
          body: JSON.stringify({ fullName, filePath }),
          githubToken: token,
        });
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Failed to fetch file.' };
      }
    },
  );
}
