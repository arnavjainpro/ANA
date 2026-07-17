import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

// The GitHub token is encrypted at rest via electron.safeStorage (Keychain on
// macOS, DPAPI on Windows) and never written to disk in plaintext.

function tokenFilePath(): string {
  return join(app.getPath('userData'), 'github.token.enc');
}

let cachedToken: string | null = null;
let cachedLogin: string | null = null;

export async function saveGitHubToken(token: string, login: string): Promise<void> {
  cachedToken = token;
  cachedLogin = login;
  if (!safeStorage.isEncryptionAvailable()) {
    // No OS keychain available — keep in memory only for this session.
    return;
  }
  const encrypted = safeStorage.encryptString(token);
  await fs.writeFile(tokenFilePath(), encrypted);
  await fs.writeFile(join(app.getPath('userData'), 'github.login'), login, 'utf-8');
}

export async function loadGitHubToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await fs.readFile(tokenFilePath());
    cachedToken = safeStorage.decryptString(encrypted);
    cachedLogin = await fs
      .readFile(join(app.getPath('userData'), 'github.login'), 'utf-8')
      .catch(() => null);
    return cachedToken;
  } catch {
    return null;
  }
}

export function getCachedLogin(): string | null {
  return cachedLogin;
}

/** Forget the stored GitHub token + login (Settings → disconnect). */
export async function clearGitHubToken(): Promise<void> {
  cachedToken = null;
  cachedLogin = null;
  await fs.rm(tokenFilePath(), { force: true });
  await fs.rm(join(app.getPath('userData'), 'github.login'), { force: true });
}

export function requireGitHubTokenSync(): string {
  if (!cachedToken) {
    throw new Error('Not connected to GitHub.');
  }
  return cachedToken;
}
