import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import { getActiveRepo } from './activeRepo.js';
import { SPEECH_SYSTEM_PROMPT } from './claude.js';

const TAVUS_API = 'https://tavusapi.com/v2';

// Spoken on join (Tavus `custom_greeting`), so Ana proactively says something
// the moment the call connects instead of waiting for the user. Picked by repo
// state so a first-time user is told how to connect one. This greeting is spoken
// directly by Tavus and does NOT depend on our LLM-override backend being wired.
const NO_REPO_GREETING =
  "Hi, I'm Ana. I can't see your code just yet — connect a repository on the left, press Index so I can read it, then press Refresh, and I'll help you understand how it works or plan something new. Until then, ask me anything.";
const REPO_GREETING =
  "Hi, I'm Ana. I can see your project now — ask me how something works, or tell me what you'd like to build, and we'll figure it out together.";

export interface TavusConversation {
  conversationId: string;
  conversationUrl: string;
  status: string;
}

/**
 * End every conversation on the account that isn't already ended. Ana is
 * single-user per Tavus account, so before starting a fresh session we reclaim
 * any that leaked (app crash, lost in-memory id, etc.) — otherwise low-tier
 * accounts immediately hit "maximum concurrent conversations". Best-effort:
 * never throws, so a cleanup hiccup can't block a legitimate start.
 */
async function reclaimConcurrencySlots(): Promise<void> {
  if (!env.tavus.apiKey) return;
  try {
    const res = await fetch(`${TAVUS_API}/conversations?limit=100`, {
      headers: { 'x-api-key': env.tavus.apiKey },
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      data?: { conversation_id: string; status: string }[];
    };
    const lingering = (data.data ?? []).filter((c) => c.status !== 'ended');
    await Promise.all(lingering.map((c) => endConversation(c.conversation_id)));
  } catch {
    // Best-effort cleanup — proceed to create regardless.
  }
}

/** A one-time briefing injected at call start so Tavus's native LLM has some
 *  repo awareness without us sitting in the per-turn speech path. */
function repoContext(): string | undefined {
  const repoFullName = getActiveRepo()?.repoFullName;
  if (!repoFullName) return undefined;
  return (
    `The user has connected the GitHub repository "${repoFullName}". ` +
    `You are helping them understand how it works and plan new features, in plain language. ` +
    `Speak at a high level; if you need specifics you don't have, ask them to point you to the part of the project they mean.`
  );
}

/**
 * Create a Tavus CVI conversation session. Speech is driven by the LLM the
 * persona is configured with (see ensurePersona): our own streaming, RAG-grounded
 * endpoint when ANA_PUBLIC_URL is set, otherwise Tavus's native hosted model. The
 * one-time conversational_context briefing gives the native fallback some repo
 * awareness. Any leaked prior sessions are reclaimed first.
 */
export async function createConversation(): Promise<TavusConversation> {
  if (!env.tavus.apiKey || !env.tavus.replicaId || !env.tavus.personaId) {
    throw new AppError(
      500,
      'TAVUS_NOT_CONFIGURED',
      'Tavus is not configured. Set TAVUS_API_KEY, TAVUS_REPLICA_ID, TAVUS_PERSONA_ID.',
    );
  }

  await reclaimConcurrencySlots();

  const active = getActiveRepo();
  const context = repoContext();

  const res = await fetch(`${TAVUS_API}/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.tavus.apiKey,
    },
    body: JSON.stringify({
      replica_id: env.tavus.replicaId,
      persona_id: env.tavus.personaId,
      conversation_name: 'Ana session',
      custom_greeting: active?.repoId ? REPO_GREETING : NO_REPO_GREETING,
      ...(context ? { conversational_context: context } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(502, 'TAVUS_API_ERROR', `Tavus create failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    conversation_id: string;
    conversation_url: string;
    status: string;
  };

  return {
    conversationId: data.conversation_id,
    conversationUrl: data.conversation_url,
    status: data.status,
  };
}

// Tavus-hosted (native) LLM — the fallback when no public backend URL is set.
// Fast and interruptible, but it only knows the one-time repo briefing; it can't
// see the actual codebase. The custom LLM path below is preferred when available.
const TAVUS_LLM_MODEL = 'tavus-claude-haiku-4.5';

// Model name Tavus sends to our OpenAI-compatible endpoint when the custom LLM is
// wired. Our backend picks its own model and ignores this, but Tavus requires the
// field — keep it descriptive.
const CUSTOM_LLM_MODEL = 'ana-voice';

// Turn-taking / barge-in config for the persona's conversational_flow layer.
// `replica_interruptibility: 'high'` lets the user interrupt Ana even at the very
// start of speech (e.g. the no-repo intro greeting), where Tavus is otherwise
// least willing to yield the floor. The remaining fields pin the current
// known-good values so the whole layer is reproducible on every startup rather
// than relying on dashboard state that can drift or reset.
const CONVERSATIONAL_FLOW = {
  turn_detection_model: 'sparrow-1',
  turn_taking_patience: 'medium',
  replica_interruptibility: 'high',
  voice_isolation: 'near',
  idle_engagement: 'off',
} as const;

/**
 * Build the persona's LLM layer. When ANA_PUBLIC_URL is set, point Tavus at our
 * own streaming, RAG-grounded `/v1/chat/completions` so Ana can actually talk
 * about the user's code; otherwise fall back to Tavus's native hosted model.
 */
function buildLlmLayer(): Record<string, unknown> {
  const publicUrl = env.ana.publicUrl.replace(/\/$/, '');
  if (publicUrl) {
    return {
      model: CUSTOM_LLM_MODEL,
      base_url: `${publicUrl}/v1`,
      // Sent as a Bearer token on every call; the completions route verifies it
      // against ANA_LLM_SECRET. Tavus requires a non-empty api_key, so fall back
      // to a placeholder when no secret is configured (the route skips the check).
      api_key: env.ana.llmSecret || 'ana-dev-key',
    };
  }
  return { model: TAVUS_LLM_MODEL, speculative_inference: true };
}

/**
 * Configure the persona's system prompt and LLM layer to a known-good state on
 * startup. Uses the shared SPEECH_SYSTEM_PROMPT so the persona and our backend
 * never drift, and points the LLM layer at our backend when ANA_PUBLIC_URL is
 * set (else the native hosted model). Replacing the whole /layers/llm object
 * also clears any stale custom base_url/api_key from earlier builds.
 *
 * Best-effort and cross-platform: a plain HTTPS PATCH (identical on
 * Windows/macOS/Linux) that never throws — a failure just logs a warning.
 */
export async function ensurePersona(): Promise<void> {
  if (!env.tavus.apiKey || !env.tavus.personaId) return;

  const layer = buildLlmLayer();
  // Tavus persona update uses JSON Patch (RFC 6902).
  const patch = [
    { op: 'replace', path: '/system_prompt', value: SPEECH_SYSTEM_PROMPT },
    { op: 'replace', path: '/layers/llm', value: layer },
    { op: 'replace', path: '/layers/conversational_flow', value: CONVERSATIONAL_FLOW },
  ];

  try {
    const res = await fetch(`${TAVUS_API}/personas/${env.tavus.personaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.tavus.apiKey },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[tavus] persona config failed (${res.status}): ${text.slice(0, 200)}`);
      return;
    }
    const using =
      'base_url' in layer
        ? `custom LLM at ${String(layer.base_url)}`
        : `hosted LLM ${TAVUS_LLM_MODEL}`;
    console.log(`[tavus] persona using ${using}`);
  } catch (err) {
    console.warn('[tavus] persona config error:', err instanceof Error ? err.message : err);
  }
}

/** End a Tavus conversation to stop metering. */
export async function endConversation(conversationId: string): Promise<void> {
  if (!env.tavus.apiKey) return;
  await fetch(`${TAVUS_API}/conversations/${conversationId}/end`, {
    method: 'POST',
    headers: { 'x-api-key': env.tavus.apiKey },
  }).catch(() => undefined);
}
