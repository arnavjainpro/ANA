import { shell } from 'electron';
import { backendJson } from '../lib/backend.js';
import { saveGitHubToken } from '../lib/tokenStore.js';

// Deep-link OAuth: open the system browser to GitHub, which redirects to
// ana://auth?code=... The main process captures that deep link and resolves the
// pending promise below with the code.

let pendingResolve: ((code: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

/** Called by the deep-link handler in index.ts when ana://auth fires. */
export function handleAuthCallback(url: string): void {
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    const error = parsed.searchParams.get('error');
    if (error) {
      pendingReject?.(new Error(`GitHub OAuth error: ${error}`));
    } else if (code) {
      pendingResolve?.(code);
    }
  } catch {
    pendingReject?.(new Error('Malformed OAuth callback URL.'));
  } finally {
    pendingResolve = null;
    pendingReject = null;
  }
}

interface GitHubConfig {
  clientId: string;
  redirectUri: string;
  scope: string;
}

/** Run the full OAuth flow; resolves with the GitHub login on success. */
export async function connectGitHub(): Promise<{ login: string }> {
  const config = await backendJson<GitHubConfig>('/auth/github/config');
  if (!config.clientId) {
    throw new Error('GitHub OAuth is not configured on the backend.');
  }

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizeUrl.searchParams.set('scope', config.scope);
  authorizeUrl.searchParams.set('state', Math.random().toString(36).slice(2));

  const codePromise = new Promise<string>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    setTimeout(() => {
      if (pendingReject) {
        pendingReject(new Error('GitHub sign-in timed out.'));
        pendingResolve = null;
        pendingReject = null;
      }
    }, 5 * 60 * 1000);
  });

  await shell.openExternal(authorizeUrl.toString());
  const code = await codePromise;

  const exchanged = await backendJson<{ githubToken: string; jwt: string; login: string }>(
    '/auth/github/exchange',
    { method: 'POST', body: JSON.stringify({ code }) },
  );

  await saveGitHubToken(exchanged.githubToken, exchanged.login);
  return { login: exchanged.login };
}
