import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import type { CreatedRepo, RepoTreeNode } from '../lib/types.js';

const GITHUB_API = 'https://api.github.com';

interface GitHubRepoSummary {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
  size: number; // size in KB per GitHub API
}

interface GitHubTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

async function gh<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(
      res.status === 404 ? 404 : res.status === 422 ? 422 : 502,
      'GITHUB_API_ERROR',
      `GitHub API ${path} failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

/** Exchange an OAuth code for an access token. Backend-only secret. */
export async function exchangeCodeForToken(code: string): Promise<string> {
  if (!env.github.clientId || !env.github.clientSecret) {
    throw new AppError(500, 'GITHUB_NOT_CONFIGURED', 'GitHub OAuth is not configured.');
  }
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.github.clientId,
      client_secret: env.github.clientSecret,
      code,
      redirect_uri: env.github.redirectUri,
    }),
  });
  if (!res.ok) {
    throw new AppError(502, 'GITHUB_OAUTH_ERROR', 'Failed to exchange OAuth code.');
  }
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new AppError(401, 'GITHUB_OAUTH_DENIED', data.error ?? 'No access token returned.');
  }
  return data.access_token;
}

/** List repos the authenticated user can access (most recently pushed first). */
export async function listRepos(token: string): Promise<GitHubRepoSummary[]> {
  const repos = await gh<GitHubRepoSummary[]>(
    '/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator',
    token,
  );
  return repos.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    default_branch: r.default_branch,
    private: r.private,
    size: r.size,
  }));
}

/** Fetch a single repo's metadata, including its size in KB. */
export async function getRepo(token: string, fullName: string): Promise<GitHubRepoSummary> {
  return gh<GitHubRepoSummary>(`/repos/${fullName}`, token);
}

/** The authenticated user's login (for git identity + repo ownership). */
export async function getAuthenticatedUser(token: string): Promise<{ login: string }> {
  const user = await gh<{ login: string }>('/user', token);
  return { login: user.login };
}

interface GitHubCreatedRepo extends GitHubRepoSummary {
  html_url: string;
  owner: { login: string };
}

/**
 * Create a repository on the authenticated user's account. On a name collision
 * (422) retries with -2 … -5 suffixes so a voice-chosen name never dead-ends;
 * the FINAL full_name is returned and must be used by every downstream step.
 */
export async function createRepo(
  token: string,
  name: string,
  description: string,
): Promise<CreatedRepo> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? name : `${name}-${attempt + 1}`;
    try {
      const repo = await gh<GitHubCreatedRepo>('/user/repos', token, {
        method: 'POST',
        body: JSON.stringify({
          name: candidate,
          description,
          private: false,
          auto_init: false,
        }),
      });
      return {
        id: repo.id,
        full_name: repo.full_name,
        default_branch: repo.default_branch || 'main',
        private: repo.private,
        size: repo.size ?? 0,
        owner: repo.owner.login,
        htmlUrl: repo.html_url,
      };
    } catch (err) {
      // 422 = name already exists on this account; try the next suffix.
      if (err instanceof AppError && err.statusCode === 422) continue;
      throw err;
    }
  }
  throw new AppError(
    409,
    'REPO_NAME_TAKEN',
    `You already have several repositories named like "${name}" — try a different project name.`,
  );
}

/** Fetch the full recursive file tree for a repo's default branch. */
export async function getRepoTree(
  token: string,
  fullName: string,
  branch: string,
): Promise<RepoTreeNode[]> {
  let data: { tree: GitHubTreeEntry[]; truncated: boolean };
  try {
    data = await gh<{ tree: GitHubTreeEntry[]; truncated: boolean }>(
      `/repos/${fullName}/git/trees/${branch}?recursive=1`,
      token,
    );
  } catch (err) {
    // An empty repo (no commits) has no resolvable default-branch tree, so the
    // GitHub API 404s. Treat that as "no files" rather than an error.
    if (err instanceof AppError && err.statusCode === 404) return [];
    throw err;
  }
  return data.tree.map((entry) => {
    const segments = entry.path.split('/');
    return {
      path: entry.path,
      name: segments[segments.length - 1] ?? entry.path,
      type: entry.type === 'tree' ? 'dir' : 'file',
      size: entry.size ?? 0,
    };
  });
}

/** Fetch the decoded UTF-8 contents of a single file. */
export async function getFileContents(
  token: string,
  fullName: string,
  filePath: string,
): Promise<string> {
  const data = await gh<{ content?: string; encoding?: string }>(
    `/repos/${fullName}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`,
    token,
  );
  if (!data.content) {
    throw new AppError(404, 'FILE_NOT_FOUND', `Could not read ${filePath}.`);
  }
  return Buffer.from(data.content, (data.encoding as BufferEncoding) ?? 'base64').toString('utf-8');
}
