import type { FastifyInstance } from 'fastify';
import { createConversation, endConversation } from '../services/tavus.js';
import { processTurn } from '../services/turn.js';
import { githubTokenFrom } from '../lib/auth.js';
import { sendError } from '../lib/errors.js';
import type { TurnRequest } from '../lib/types.js';

/** Tavus session start + per-turn Claude processing. */
export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  // Create a Tavus CVI conversation; return the URL for the renderer to embed.
  app.post('/conversation/start', async (_req, reply) => {
    try {
      const conversation = await createConversation();
      return reply.send(conversation);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // End a Tavus conversation (stop metering).
  app.post<{ Body: { conversationId: string } }>('/conversation/end', async (req, reply) => {
    try {
      const { conversationId } = req.body ?? {};
      if (conversationId) await endConversation(conversationId);
      return reply.send({ ok: true });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Process one conversation turn (the two-call Claude pattern).
  app.post<{ Body: TurnRequest & { repoFullName?: string } }>(
    '/conversation/turn',
    async (req, reply) => {
      try {
        const body = req.body;
        if (!body?.repoId || !body.utterance) {
          return reply
            .status(400)
            .send({ error: 'Missing repoId or utterance', code: 'MISSING_FIELDS' });
        }
        // GitHub token is optional here — only needed for on-demand file fetch.
        let githubToken: string | undefined;
        try {
          githubToken = githubTokenFrom(req);
        } catch {
          githubToken = undefined;
        }

        const result = await processTurn(body, {
          githubToken,
          repoFullName: body.repoFullName,
        });
        return reply.send(result);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
