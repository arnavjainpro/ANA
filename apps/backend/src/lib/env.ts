import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Centralised, validated access to environment variables. API keys live here
 * and in the backend only — they must never cross to the renderer or IPC.
 */

// The backend runs with its cwd set to apps/backend (npm workspace), but the
// canonical .env lives at the repo root. Walk up from cwd to find it so the
// same file works whether the server is launched from the root or the workspace.
function findEnvFile(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envPath = findEnvFile();
dotenv.config(envPath ? { path: envPath } : undefined);

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

// Read lazily-ish: validate the keys we always need at import time, but allow
// the server to boot for Phase 1/2 work even if AI keys are absent by only
// throwing when a service that needs them is actually used.
export const env = {
  port: Number.parseInt(optional('PORT', '8787'), 10),
  jwtSecret: optional('JWT_SECRET', 'dev-insecure-secret-change-me'),

  github: {
    clientId: optional('GITHUB_CLIENT_ID', ''),
    clientSecret: optional('GITHUB_CLIENT_SECRET', ''),
    redirectUri: optional('GITHUB_REDIRECT_URI', 'ana://auth'),
  },

  anthropic: {
    apiKey: optional('ANTHROPIC_API_KEY', ''),
  },

  openai: {
    apiKey: optional('OPENAI_API_KEY', ''),
  },

  supabase: {
    url: optional('SUPABASE_URL', ''),
    serviceKey: optional('SUPABASE_SERVICE_KEY', ''),
  },

  tavus: {
    apiKey: optional('TAVUS_API_KEY', ''),
    replicaId: optional('TAVUS_REPLICA_ID', ''),
    personaId: optional('TAVUS_PERSONA_ID', ''),
  },

  // Public HTTPS URL where Tavus can reach THIS backend (e.g. an ngrok/cloudflare
  // tunnel in dev, or the deployed origin). When set, the persona's LLM layer is
  // auto-pointed here on startup so Tavus routes turns through /v1/chat/completions.
  // llmSecret is the bearer token Tavus must present on those calls — it is sent
  // as the persona LLM layer's api_key and verified on the completions route.
  // Leave blank to disable the check (dev convenience).
  ana: {
    publicUrl: optional('ANA_PUBLIC_URL', ''),
    llmSecret: optional('ANA_LLM_SECRET', ''),
  },
} as const;

/** Assert a specific key is present at the point of use, with a clear message. */
export function requireEnv(name: string): string {
  return required(name);
}
