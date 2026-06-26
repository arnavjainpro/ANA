import type { FastifyInstance } from 'fastify';
import {
  classifyIntent,
  generateNoRepoReply,
  streamSpokenReply,
  SPOKEN_FALLBACK,
} from '../services/claude.js';
import { processTurn } from '../services/turn.js';
import { retrieveChunks } from '../services/retrieval.js';
import { getProjectMap } from '../services/projectMap.js';
import { getArchitectureSummary } from '../services/architectureSummary.js';
import { getActiveRepo } from '../services/activeRepo.js';
import { publishPanel, publishBuildRequest } from '../services/panelBus.js';
import { env } from '../lib/env.js';
import type { ConversationTurn, IntentClassification } from '../lib/types.js';

// Spoken while the desktop applies a voice change to disk; the real diff + Undo
// bar appear in the right panel.
const BUILD_VOICE_CONFIRMATION = "Okay — I'm making that change now; you'll see it on the right.";

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

// Produce the visual panel and publish it out-of-band. Detached so a slow
// Sonnet call never delays the voice reply; swallows its own errors.
function publishPanelInBackground(
  repoId: string,
  transcript: string,
  history: ConversationTurn[],
  options: { githubToken?: string; repoFullName?: string; precomputedIntent?: IntentClassification },
): void {
  void processTurn({ repoId, utterance: transcript, history }, options)
    .then((result) => {
      publishPanel({
        mode: result.mode,
        spoken: result.spoken,
        panel: result.panel,
        payload: result.payload,
      });
    })
    .catch((err) => {
      console.error('[completions] panel publish failed:', err instanceof Error ? err.message : err);
    });
}

// OpenAI-compatible endpoint Tavus calls on every voice turn: streams a
// RAG-grounded spoken reply, with the panel/Build work handled out-of-band.
export async function completionsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ChatCompletionRequest }>('/v1/chat/completions', async (req, reply) => {
    // Publicly reachable, so require the shared secret (Bearer) when configured.
    if (env.ana.llmSecret) {
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${env.ana.llmSecret}`) {
        return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      }
    }

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

    // Opening chunk announces the assistant role (OpenAI streaming convention).
    reply.raw.write(chunkLine(base, { role: 'assistant', content: '' }, null));

    try {
      const active = getActiveRepo();
      if (active?.repoId) {
        // Classify in parallel with retrieval (no added latency), then branch:
        // Build goes to the desktop to apply on disk; else answer by voice.
        const [intent, chunks, projectMap, architectureSummary] = await Promise.all([
          classifyIntent(transcript, history),
          retrieveChunks(active.repoId, transcript),
          active.githubToken && active.repoFullName
            ? getProjectMap(active.repoFullName, active.githubToken)
            : Promise.resolve(undefined),
          getArchitectureSummary(active.repoId),
        ]);

        if (intent.mode === 'Build') {
          publishBuildRequest(transcript);
          reply.raw.write(chunkLine(base, { content: BUILD_VOICE_CONFIRMATION }, null));
        } else {
          publishPanelInBackground(active.repoId, transcript, history, {
            githubToken: active.githubToken,
            repoFullName: active.repoFullName,
            precomputedIntent: intent,
          });
          for await (const delta of streamSpokenReply({
            utterance: transcript,
            history,
            chunks,
            projectMap,
            architectureSummary,
          })) {
            reply.raw.write(chunkLine(base, { content: delta }, null));
          }
        }
      } else {
        // No repo connected/indexed yet — guide the user through connecting one
        // instead of answering blindly about code Ana cannot see.
        const response = await generateNoRepoReply({ utterance: transcript, history });
        reply.raw.write(chunkLine(base, { content: response.spoken }, null));
      }
    } catch (err) {
      // Never leave Tavus hanging — speak the fallback instead.
      console.error('[completions] turn failed:', err instanceof Error ? err.message : err);
      reply.raw.write(chunkLine(base, { content: SPOKEN_FALLBACK }, null));
    }

    // Terminal chunk: empty delta + finish_reason "stop", then the DONE sentinel.
    reply.raw.write(chunkLine(base, {}, 'stop'));
    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  });
}
