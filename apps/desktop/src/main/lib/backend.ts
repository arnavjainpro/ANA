// Thin HTTP client for the Ana backend. Runs in the Electron main process only,
// so API keys and the GitHub token never cross into the renderer.

const BACKEND_URL = process.env.ANA_BACKEND_URL ?? 'http://localhost:8787';

export function backendUrl(path: string): string {
  return `${BACKEND_URL}${path}`;
}

export async function backendJson<T>(
  path: string,
  init: RequestInit & { githubToken?: string } = {},
): Promise<T> {
  const { githubToken, headers, ...rest } = init;
  const res = await fetch(backendUrl(path), {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(githubToken ? { 'x-github-token': githubToken } : {}),
      ...(headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Backend error ${res.status}`);
  }
  return data;
}

export { BACKEND_URL };
