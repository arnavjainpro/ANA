import type { FastifyInstance } from 'fastify';
import { createConversation, endConversation } from '../services/tavus.js';
import { processTurn, processBuildTurn, undoBuild, endBuildSession } from '../services/turn.js';
import { setActiveRepo, clearActiveRepo } from '../services/activeRepo.js';
import { subscribePanel } from '../services/panelBus.js';
import { githubTokenFrom } from '../lib/auth.js';
import { sendError } from '../lib/errors.js';
import type { BuildTurnRequest, TurnRequest } from '../lib/types.js';

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

  // Build mode: classify → reason → validate → return patches for the client to
  // apply atomically to disk. Pushes the operation onto the per-session undo stack.
  app.post<{ Body: BuildTurnRequest }>('/conversation/build', async (req, reply) => {
    try {
      const body = req.body;
      if (!body?.sessionId || !body.transcript) {
        return reply
          .status(400)
          .send({ error: 'Missing sessionId or transcript', code: 'MISSING_FIELDS' });
      }
      let githubToken: string | undefined;
      try {
        githubToken = githubTokenFrom(req);
      } catch {
        githubToken = undefined;
      }
      const result = await processBuildTurn(body, { githubToken });
      return reply.send(result);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Undo the most recent Build operation for a session; returns reversed patches.
  app.post<{ Body: { sessionId: string } }>('/conversation/undo', async (req, reply) => {
    try {
      const { sessionId } = req.body ?? {};
      if (!sessionId) {
        return reply.status(400).send({ error: 'Missing sessionId', code: 'MISSING_FIELDS' });
      }
      return reply.send(undoBuild(sessionId));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Stream right-panel updates from voice turns to the desktop app as NDJSON.
  // The desktop main process holds this connection open for the app's lifetime
  // and forwards each event to the renderer.
  app.get('/conversation/events', async (_req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const unsubscribe = subscribePanel((evt) => {
      reply.raw.write(`${JSON.stringify(evt)}\n`);
    });
    // Newline keep-alive so idle proxies/tunnels don't drop the connection;
    // blank lines are ignored by the client parser.
    const keepAlive = setInterval(() => reply.raw.write('\n'), 25_000);
    reply.raw.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  // Record which repo the client is working in, so the OpenAI-compatible
  // /v1/chat/completions endpoint (called by Tavus, which can't pass a repoId)
  // can run RAG against it.
  app.post<{ Body: { repoId: string; repoFullName?: string } }>(
    '/conversation/active-repo',
    async (req, reply) => {
      try {
        const { repoId, repoFullName } = req.body ?? {};
        if (!repoId) {
          return reply.status(400).send({ error: 'Missing repoId', code: 'MISSING_FIELDS' });
        }
        let githubToken: string | undefined;
        try {
          githubToken = githubTokenFrom(req);
        } catch {
          githubToken = undefined;
        }
        setActiveRepo({ repoId, repoFullName, githubToken });
        return reply.send({ ok: true });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  // Forget the active repo so Ana starts a session with no stale context
  // (called on app launch and when switching repos before re-indexing).
  app.post('/conversation/reset-context', async (_req, reply) => {
    try {
      clearActiveRepo();
      return reply.send({ ok: true });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Clear a session's undo history (GitHub disconnect / app close).
  app.post<{ Body: { sessionId: string } }>('/conversation/session/end', async (req, reply) => {
    try {
      const { sessionId } = req.body ?? {};
      if (sessionId) endBuildSession(sessionId);
      return reply.send({ ok: true });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
