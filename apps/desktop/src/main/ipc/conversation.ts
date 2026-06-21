import { ipcMain } from 'electron';
import { backendJson } from '../lib/backend.js';
import { loadGitHubToken } from '../lib/tokenStore.js';
import type { IpcResult, TurnRequest, TurnResult } from '../../types.js';

export function registerConversationIpc(): void {
  ipcMain.handle(
    'conversation:start',
    async (): Promise<IpcResult<{ conversationId: string; conversationUrl: string }>> => {
      try {
        return await backendJson('/conversation/start', { method: 'POST', body: '{}' });
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not start conversation.' };
      }
    },
  );

  ipcMain.handle(
    'conversation:turn',
    async (_e, req: TurnRequest): Promise<IpcResult<TurnResult>> => {
      try {
        const token = await loadGitHubToken();
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
}
