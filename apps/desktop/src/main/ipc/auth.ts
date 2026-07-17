import { ipcMain } from 'electron';
import { connectGitHub } from '../github/oauth.js';
import { loadGitHubToken, getCachedLogin, clearGitHubToken } from '../lib/tokenStore.js';
import type { IpcResult } from '../../types.js';

export function registerAuthIpc(): void {
  ipcMain.handle('auth:connectGitHub', async (): Promise<IpcResult<{ login: string }>> => {
    try {
      return await connectGitHub();
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'GitHub sign-in failed.' };
    }
  });

  ipcMain.handle('auth:status', async (): Promise<{ connected: boolean; login: string | null }> => {
    try {
      const token = await loadGitHubToken();
      return { connected: Boolean(token), login: getCachedLogin() };
    } catch {
      return { connected: false, login: null };
    }
  });

  ipcMain.handle('auth:disconnectGitHub', async (): Promise<{ ok: true }> => {
    await clearGitHubToken();
    return { ok: true };
  });
}
