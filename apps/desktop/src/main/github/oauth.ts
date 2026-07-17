import { createServer } from 'node:http';
import { shell } from 'electron';
import { backendJson, setSessionJwt } from '../lib/backend.js';
import { saveGitHubToken } from '../lib/tokenStore.js';

// GitHub OAuth supports two callback strategies, chosen by the backend's
// configured redirect URI:
//   • http(s) loopback (e.g. http://127.0.0.1:8788/callback) — GitHub OAuth
//     Apps only permit http/https callbacks, so this is the default. The main
//     process spins up a one-shot HTTP server to catch the redirect.
//   • ana:// custom protocol — used only when the app is packaged with the
//     protocol registered (and a hosted https bounce page exists). The main
//     process captures the deep link via handleAuthCallback below.

let pendingResolve: ((code: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

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

const SUCCESS_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Ana</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}div{text-align:center}</style>
</head><body><div><h2>You're connected to GitHub ✓</h2><p>You can close this tab and return to Ana.</p></div></body></html>`;

/**
 * Start a one-shot loopback HTTP server on the redirect URI's host/port and
 * resolve with the OAuth `code` GitHub sends to it. The server closes itself
 * once the callback (or an error/timeout) arrives.
 */
function waitForCodeViaLoopback(redirectUri: string): Promise<string> {
  const target = new URL(redirectUri);
  const port = Number(target.port) || 80;
  const host = target.hostname; // 127.0.0.1 / localhost

  return new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', `http://${host}:${port}`);
      if (reqUrl.pathname !== target.pathname) {
        res.writeHead(404).end();
        return;
      }
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' }).end(SUCCESS_PAGE);
      cleanup();

      if (error) reject(new Error(`GitHub OAuth error: ${error}`));
      else if (code) resolve(code);
      else reject(new Error('GitHub callback did not include a code.'));
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('GitHub sign-in timed out.'));
    }, OAUTH_TIMEOUT_MS);

    function cleanup(): void {
      clearTimeout(timer);
      server.close();
    }

    server.on('error', (err: NodeJS.ErrnoException) => {
      cleanup();
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(`Port ${port} is already in use — close whatever is using it and retry.`)
          : err,
      );
    });

    server.listen(port, host);
  });
}

/** Resolve with the OAuth code delivered via the ana:// deep link. */
function waitForCodeViaDeepLink(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    setTimeout(() => {
      if (pendingReject) {
        pendingReject(new Error('GitHub sign-in timed out.'));
        pendingResolve = null;
        pendingReject = null;
      }
    }, OAUTH_TIMEOUT_MS);
  });
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

  // Loopback servers must be listening *before* the browser is sent to GitHub,
  // otherwise the redirect races the listener.
  const isLoopback = /^https?:$/.test(new URL(config.redirectUri).protocol);
  const codePromise = isLoopback
    ? waitForCodeViaLoopback(config.redirectUri)
    : waitForCodeViaDeepLink();

  await shell.openExternal(authorizeUrl.toString());
  const code = await codePromise;

  const exchanged = await backendJson<{ githubToken: string; jwt: string; login: string }>(
    '/auth/github/exchange',
    { method: 'POST', body: JSON.stringify({ code }) },
  );

  await saveGitHubToken(exchanged.githubToken, exchanged.login);
  setSessionJwt(exchanged.jwt);
  return { login: exchanged.login };
}
