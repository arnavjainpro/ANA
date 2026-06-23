import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import { getActiveRepo } from './activeRepo.js';

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

/**
 * Create a Tavus CVI conversation session. Ana's spoken replies are driven by
 * our backend via the persona's LLM override layer (configured on the persona
 * referenced by TAVUS_PERSONA_ID), so the face speaks the `spoken` value Claude
 * returns. Any leaked prior sessions are reclaimed first.
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
      custom_greeting: getActiveRepo()?.repoId ? REPO_GREETING : NO_REPO_GREETING,
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

// Clean, plain-text persona prompt (the runtime source of truth for the auto
// config below). Keep in sync with apps/backend/prompts/ana-persona.md.
const PERSONA_SYSTEM_PROMPT = `You are Ana, a warm, patient voice-first AI coding partner for people who are not technical.

Your personality:
- Friendly, encouraging, and calm. You never make anyone feel behind.
- You explain things in plain, everyday language. No jargon. If a technical term is unavoidable, you explain it in one short sentence.
- You speak conversationally, in 2 to 4 sentences. You sound like a helpful person, not a manual.

Your rules:
- Never read out code, file paths, or symbols. Describe what they do in plain words instead.
- Keep responses short and spoken-friendly. No lists, no markdown, no bullet points.
- When you are unsure, say so honestly and ask one simple clarifying question.
- Stay focused on helping the person understand and plan their software project.

You are helping the user understand a codebase and plan new features. Be supportive and make them feel capable.`;

/**
 * Point the Tavus persona's LLM layer at this backend so Tavus routes every turn
 * through our /v1/chat/completions (RAG + spoken reply), and reset a clean system
 * prompt. Runs on startup when ANA_PUBLIC_URL is set — tunnel URLs rotate between
 * dev sessions, so doing it on boot avoids re-running a script each time.
 *
 * Best-effort and cross-platform: it's a plain HTTPS PATCH, identical on
 * Windows/macOS/Linux, and never throws (a failure just logs a warning).
 */
export async function configurePersonaFromEnv(): Promise<void> {
  const publicUrl = env.ana.publicUrl;
  if (!publicUrl) return; // opt-in; configure Tavus manually otherwise
  if (!env.tavus.apiKey || !env.tavus.personaId) {
    console.warn('[tavus] ANA_PUBLIC_URL set but TAVUS_API_KEY/TAVUS_PERSONA_ID missing — skipping persona config.');
    return;
  }

  const base = `${publicUrl.replace(/\/+$/, '')}/v1`;
  // Tavus persona update uses JSON Patch (RFC 6902).
  const patch = [
    { op: 'replace', path: '/system_prompt', value: PERSONA_SYSTEM_PROMPT },
    {
      op: 'replace',
      path: '/layers/llm',
      value: {
        model: 'ana',
        base_url: base,
        api_key: 'not-used-our-endpoint-ignores-auth',
        speculative_inference: true,
      },
    },
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
    console.log(`[tavus] persona LLM layer pointed at ${base}`);
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
