import { ipcMain } from 'electron';
import simpleGit from 'simple-git';
import type { GitStatus, IpcResult } from '../../types.js';

/**
 * Stage a list of repo-relative paths. Called automatically after every
 * successful patch application. We never auto-commit — the user commits in
 * their own Git client.
 */
export async function stagePaths(repoPath: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await simpleGit(repoPath).add(paths);
}

export function registerGitIpc(): void {
  ipcMain.handle(
    'git:stage',
    async (_e, repoPath: string, paths: string[]): Promise<IpcResult<{ success: true }>> => {
      try {
        await stagePaths(repoPath, paths);
        return { success: true };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not stage files.' };
      }
    },
  );

  ipcMain.handle(
    'git:getStatus',
    async (_e, repoPath: string): Promise<IpcResult<GitStatus>> => {
      try {
        const status = await simpleGit(repoPath).status();
        return {
          staged: status.staged,
          unstaged: status.modified,
          untracked: status.not_added,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not read git status.' };
      }
    },
  );
}
