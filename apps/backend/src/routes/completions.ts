import type { FastifyInstance } from 'fastify';
import { classifyIntent, generateResponse, SPOKEN_FALLBACK } from '../services/claude.js';
import { processTurn } from '../services/turn.js';
import { getActiveRepo } from '../services/activeRepo.js';
import type { ConversationTurn, Mode } from '../lib/types.js';

/** OpenAI-compatible chat message (the shape Tavus sends). */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
}

type Delta = { role?: 'assistant'; content?: string };

/** Emit one OpenAI-style chat.completion.chunk SSE line. */
function chunkLine(
  base: { id: string; created: number; model: string },
  delta: Delta,
  finishReason: 'stop' | null,
): string {
  const payload = {
    id: base.id,
    object: 'chat.completion.chunk',
    created: base.created,
    model: base.model,
    choices: [{ delta, index: 0, finish_reason: finishReason }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * OpenAI-compatible endpoint Tavus calls on every conversation turn. It runs the
 * existing two-call Claude pipeline (Haiku classify → Sonnet reason) and streams
 * back only the `spoken` string, word by word, as an SSE chat.completion stream.
 */
export async function completionsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ChatCompletionRequest }>('/v1/chat/completions', async (req, reply) => {
    const messages = req.body?.messages ?? [];

    // The latest user utterance is the last message with role === 'user'.
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') {
        lastUserIndex = i;
        break;
      }
    }
    const transcript = lastUserIndex >= 0 ? (messages[lastUserIndex]?.content ?? '') : '';

    // Everything before the latest user utterance is conversation history.
    const history: ConversationTurn[] = messages
      .slice(0, lastUserIndex >= 0 ? lastUserIndex : messages.length)
      .flatMap((m) => (m.role === 'system' ? [] : [{ role: m.role, content: m.content }]));

    // Open the SSE stream before any heavy work so the connection stays alive.
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const base = {
      id: `chatcmpl-${Date.now()}`,
      created: Math.floor(Date.now() / 1000),
      model: req.body?.model ?? 'ana',
    };

    let spoken: string;
    try {
      const active = getActiveRepo();
      if (active?.repoId) {
        // Repo-aware: run the full pipeline (classify → RAG → reason) so Ana can
        // actually talk about the repo the user is working in.
        const result = await processTurn(
          { repoId: active.repoId, utterance: transcript, history },
          { githubToken: active.githubToken, repoFullName: active.repoFullName },
        );
        spoken = result.spoken;
      } else {
        // No repo selected yet — reply generally (no retrieval).
        const intent = await classifyIntent(transcript, history);
        const mode: Mode = intent.mode === 'Plan' ? 'Plan' : 'Understand';
        const response = await generateResponse({
          mode,
          utterance: transcript,
          intent,
          chunks: [],
          history,
        });
        spoken = response.spoken;
      }
    } catch {
      // Never leave Tavus hanging — speak the fallback instead.
      spoken = SPOKEN_FALLBACK;
    }

    // Opening chunk announces the assistant role (OpenAI streaming convention).
    reply.raw.write(chunkLine(base, { role: 'assistant', content: '' }, null));
    for (const word of spoken.split(' ').filter(Boolean)) {
      reply.raw.write(chunkLine(base, { content: `${word} ` }, null));
    }
    // Terminal chunk: empty delta + finish_reason "stop", then the DONE sentinel.
    reply.raw.write(chunkLine(base, {}, 'stop'));
    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  });
}
