import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';

const TAVUS_API = 'https://tavusapi.com/v2';

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

/** End a Tavus conversation to stop metering. */
export async function endConversation(conversationId: string): Promise<void> {
  if (!env.tavus.apiKey) return;
  await fetch(`${TAVUS_API}/conversations/${conversationId}/end`, {
    method: 'POST',
    headers: { 'x-api-key': env.tavus.apiKey },
  }).catch(() => undefined);
}
