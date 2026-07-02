import { ipcMain, dialog, BrowserWindow, type OpenDialogOptions } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { backendJson } from '../lib/backend.js';
import { loadGitHubToken } from '../lib/tokenStore.js';
import { setStoredRepoPath } from '../lib/repoPaths.js';
import { applyPatchesToDisk } from './filesystem.js';
import type {
  IpcResult,
  ProjectCreateResult,
  ProjectProgress,
  RepoSummary,
  ScaffoldResult,
  ConversationTurn,
} from '../../types.js';

/**
 * New-project creation: Ana scaffolds a project, we write it to a user-chosen
 * folder, make the initial commit, have the backend create the GitHub repo,
 * and push. This initial commit+push is a deliberate exception to the "Ana
 * never commits" rule, scoped to project creation only — an empty repo with
 * no first commit is useless to the user.
 */

interface CreatedRepoResponse {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
  size: number;
  owner: string;
  htmlUrl: string;
}

/** A GitHub-safe directory slug from the scaffold's project name. */
function slugOf(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) ||
    'new-project'
  );
}

/** First non-existing variant of <parent>/<slug>: plain, then -2, -3, … */
async function availableDir(parentDir: string, slug: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const dir = join(parentDir, attempt === 0 ? slug : `${slug}-${attempt + 1}`);
    try {
      await fs.access(dir);
    } catch {
      return dir;
    }
  }
  throw new Error(`Too many folders named like "${slug}" already exist there.`);
}

export function registerProjectIpc(getWindow: () => BrowserWindow | null): void {
  const progress = (p: ProjectProgress): void => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('project:progress', p);
  };

  // Proxy the scaffold generation to the backend (Claude call lives there).
  ipcMain.handle(
    'project:scaffold',
    async (
      _e,
      transcript: string,
      history: ConversationTurn[],
    ): Promise<IpcResult<ScaffoldResult>> => {
      try {
        return await backendJson<ScaffoldResult>('/project/scaffold', {
          method: 'POST',
          body: JSON.stringify({ transcript, history }),
        });
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Scaffold generation failed.' };
      }
    },
  );

  // Pick the PARENT directory the new project folder will be created inside.
  // (Distinct from build:selectRepoPath, which validates an existing clone.)
  ipcMain.handle(
    'project:selectParentDir',
    async (_e, projectName: string): Promise<IpcResult<{ parentDir: string }>> => {
      try {
        const win = getWindow() ?? BrowserWindow.getFocusedWindow() ?? undefined;
        const opts: OpenDialogOptions = {
          properties: ['openDirectory', 'createDirectory'],
          title: `Choose where to put ${projectName}`,
          buttonLabel: 'Create here',
        };
        const result = win
          ? await dialog.showOpenDialog(win, opts)
          : await dialog.showOpenDialog(opts);
        const folder = result.filePaths[0];
        if (result.canceled || !folder) return { error: 'cancelled' };
        return { parentDir: folder };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not select a folder.' };
      }
    },
  );

  // The orchestrator: files → git init+commit → GitHub repo → push → persist.
  // Each step fails into a coherent state (see the per-step handling).
  ipcMain.handle(
    'project:create',
    async (
      _e,
      args: { scaffold: ScaffoldResult; parentDir: string; login: string | null },
    ): Promise<IpcResult<ProjectCreateResult>> => {
      const { scaffold, parentDir, login } = args;
      const slug = slugOf(scaffold.projectName);

      // 1-2: create the project directory (suffix if the name is taken).
      let projectDir: string;
      try {
        projectDir = await availableDir(parentDir, slug);
        await fs.mkdir(projectDir, { recursive: false });
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Could not create the folder.' };
      }

      // 3: write all files atomically (reuses Build's forbidden-path defence).
      progress({ stage: 'writing' });
      try {
        await applyPatchesToDisk(
          projectDir,
          scaffold.files.map((f) => ({
            path: f.path,
            original: '',
            updated: f.contents,
            summary: f.summary,
          })),
        );
      } catch (err) {
        // We created this directory ourselves moments ago — safe to remove.
        await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
        return { error: err instanceof Error ? err.message : 'Could not write the project files.' };
      }

      // 4: git init + initial commit (local identity fallback if none is set).
      progress({ stage: 'committing' });
      const git = simpleGit(projectDir);
      try {
        await git.init(['-b', 'main']);
        const email = await git.raw(['config', '--get', 'user.email']).catch(() => '');
        if (!email.trim()) {
          const name = login ?? 'ana';
          await git.addConfig('user.name', name, false, 'local');
          await git.addConfig('user.email', `${name}@users.noreply.github.com`, false, 'local');
        }
        await git.add('-A');
        await git.commit('Initial commit from Ana');
      } catch (err) {
        // Files stay on disk (they're the user's work); nothing is dangling.
        return {
          error: `I created the files, but couldn't set up version control: ${
            err instanceof Error ? err.message : 'git failed'
          }`,
        };
      }

      // 5: create the repository on GitHub (backend handles name collisions).
      progress({ stage: 'creating-repo' });
      let created: CreatedRepoResponse;
      try {
        const token = await loadGitHubToken();
        if (!token) throw new Error('GitHub is not connected.');
        created = await backendJson<CreatedRepoResponse>('/project/create-repo', {
          method: 'POST',
          body: JSON.stringify({ name: slug, description: scaffold.description }),
          githubToken: token,
        });
      } catch (err) {
        return {
          error: `Your project is ready locally, but I couldn't create it on GitHub: ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        };
      }

      const repo: RepoSummary = {
        id: created.id,
        full_name: created.full_name,
        default_branch: created.default_branch || 'main',
        private: created.private,
        size: created.size,
      };

      // 6: push. The token rides in a ONE-SHOT positional URL that is never
      // written to .git/config; origin gets the clean URL.
      progress({ stage: 'pushing' });
      let warning: string | undefined;
      try {
        await git.addRemote('origin', `https://github.com/${created.full_name}.git`);
        const token = await loadGitHubToken();
        await git.push([
          `https://x-access-token:${token}@github.com/${created.full_name}.git`,
          'HEAD:main',
        ]);
      } catch (err) {
        // git errors can echo the command line — scrub any credentialed URL so
        // the token never reaches logs or the renderer.
        const raw = err instanceof Error ? err.message : 'unknown error';
        warning = `push failed: ${raw.replace(/https:\/\/[^@\s]+@/g, 'https://')}`;
      }

      // 7: remember the local path so Build/run flows resolve it immediately.
      await setStoredRepoPath(created.full_name, projectDir);

      return {
        repoPath: projectDir,
        repo,
        owner: created.owner,
        htmlUrl: created.htmlUrl,
        ...(warning ? { warning } : {}),
      };
    },
  );
}
