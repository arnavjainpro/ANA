// Thin HTTP client for the Ana backend. Runs in the Electron main process only,
// so API keys and the GitHub token never cross into the renderer.

import { loadGitHubToken } from './tokenStore.js';

const BACKEND_URL = process.env.ANA_BACKEND_URL ?? 'http://localhost:8787';

// The session JWT lives in memory only. It is set after an OAuth exchange and
// re-minted from the stored GitHub token on launch or after expiry, so nothing
// beyond the safeStorage-encrypted GitHub token ever touches disk.
let sessionJwt: string | null = null;
let refreshing: Promise<string | null> | null = null;

export function setSessionJwt(jwt: string | null): void {
  sessionJwt = jwt;
}

async function refreshSessionJwt(): Promise<string | null> {
  const githubToken = await loadGitHubToken();
  if (!githubToken) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/auth/session`, {
      method: 'POST',
      headers: { 'x-github-token': githubToken },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { jwt?: string };
    sessionJwt = data.jwt ?? null;
    return sessionJwt;
  } catch {
    return null;
  }
}

/** Mint the session JWT if we do not have one, deduplicating concurrent calls. */
async function ensureSessionJwt(): Promise<string | null> {
  if (sessionJwt) return sessionJwt;
  refreshing ??= refreshSessionJwt().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export function backendUrl(path: string): string {
  return `${BACKEND_URL}${path}`;
}

/** Auth headers for raw streaming fetches (NDJSON/SSE) that bypass backendJson. */
export async function sessionHeaders(): Promise<Record<string, string>> {
  const jwt = await ensureSessionJwt();
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

// The session endpoints authenticate with the GitHub token, not the JWT.
const NO_SESSION_PATHS = ['/auth/github/config', '/auth/github/exchange', '/auth/session', '/health'];

export async function backendJson<T>(
  path: string,
  init: RequestInit & { githubToken?: string } = {},
): Promise<T> {
  const { githubToken, headers, ...rest } = init;
  const needsSession = !NO_SESSION_PATHS.some((p) => path.startsWith(p));
  const jwt = needsSession ? await ensureSessionJwt() : null;

  const doFetch = (bearer: string | null): Promise<Response> =>
    fetch(backendUrl(path), {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(githubToken ? { 'x-github-token': githubToken } : {}),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(headers ?? {}),
      },
    });

  let res = await doFetch(jwt);
  // An expired JWT gets one refresh + retry before surfacing the error.
  if (res.status === 401 && needsSession) {
    sessionJwt = null;
    const renewed = await ensureSessionJwt();
    if (renewed) res = await doFetch(renewed);
  }

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Backend error ${res.status}`);
  }
  return data;
}

export { BACKEND_URL };
