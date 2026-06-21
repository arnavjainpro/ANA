import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';

const TAVUS_API = 'https://tavusapi.com/v2';

export interface TavusConversation {
  conversationId: string;
  conversationUrl: string;
  status: string;
}

/**
 * Create a Tavus CVI conversation session. Ana's spoken replies are driven by
 * our backend via the persona's LLM override layer (configured on the persona
 * referenced by TAVUS_PERSONA_ID — see configureLlmOverride below), so the
 * face speaks the `spoken` value Claude returns.
 */
export async function createConversation(): Promise<TavusConversation> {
  if (!env.tavus.apiKey || !env.tavus.replicaId || !env.tavus.personaId) {
    throw new AppError(
      500,
      'TAVUS_NOT_CONFIGURED',
      'Tavus is not configured. Set TAVUS_API_KEY, TAVUS_REPLICA_ID, TAVUS_PERSONA_ID.',
    );
  }

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
