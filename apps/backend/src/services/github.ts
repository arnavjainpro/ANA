import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import type { RepoTreeNode } from '../lib/types.js';

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

async function gh<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(
      res.status === 404 ? 404 : 502,
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

/** Fetch the full recursive file tree for a repo's default branch. */
export async function getRepoTree(
  token: string,
  fullName: string,
  branch: string,
): Promise<RepoTreeNode[]> {
  const data = await gh<{ tree: GitHubTreeEntry[]; truncated: boolean }>(
    `/repos/${fullName}/git/trees/${branch}?recursive=1`,
    token,
  );
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
