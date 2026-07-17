import type { FastifyInstance } from 'fastify';
import { createConversation, endConversation } from '../services/tavus.js';
import {
  processTurn,
  planBuildTurn,
  processBuildTurn,
  undoBuild,
  redoBuild,
  endBuildSession,
} from '../services/turn.js';
import {
  setActiveRepo,
  clearActiveRepo,
  registerConversation,
  unregisterConversation,
} from '../services/activeRepo.js';
import { subscribePanel } from '../services/panelBus.js';
import { assertRepoOwner } from '../services/repoAccess.js';
import { githubTokenFrom } from '../lib/auth.js';
import { sendError } from '../lib/errors.js';
import type { BuildTurnRequest, TurnRequest } from '../lib/types.js';

// Claude-backed turns are the expensive path; keep a sane per-tenant ceiling.
const TURN_RATE_LIMIT = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

/** Tavus session start + per-turn Claude processing. */
export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  // Create a Tavus CVI conversation; return the URL for the renderer to embed.
  // The conversation is registered to the caller so voice turns arriving at
  // /v1/chat/completions can be resolved back to this tenant.
  app.post('/conversation/start', async (req, reply) => {
    try {
      const conversation = await createConversation(req.ownerId);
      registerConversation(conversation.conversationId, req.ownerId);
      return reply.send(conversation);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // End a Tavus conversation (stop metering).
  app.post<{ Body: { conversationId: string } }>('/conversation/end', async (req, reply) => {
    try {
      const { conversationId } = req.body ?? {};
      if (conversationId) {
        unregisterConversation(conversationId);
        await endConversation(conversationId);
      }
      return reply.send({ ok: true });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Process one conversation turn (the two-call Claude pattern).
  app.post<{ Body: TurnRequest & { repoFullName?: string } }>(
    '/conversation/turn',
    TURN_RATE_LIMIT,
    async (req, reply) => {
      try {
        const body = req.body;
        if (!body?.repoId || !body.utterance) {
          return reply
            .status(400)
            .send({ error: 'Missing repoId or utterance', code: 'MISSING_FIELDS' });
        }
        await assertRepoOwner(body.repoId, req.ownerId);
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

  // Build phase 1: classify + RAG to pick the target file paths the client
  // should read from its local working copy before the reasoning call.
  app.post<{ Body: BuildTurnRequest }>('/conversation/build/plan', async (req, reply) => {
    try {
      const body = req.body;
      if (!body?.transcript) {
        return reply.status(400).send({ error: 'Missing transcript', code: 'MISSING_FIELDS' });
      }
      return reply.send(await planBuildTurn(body));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Build mode: classify → reason → validate → return patches for the client to
  // apply atomically to disk. Pushes the operation onto the per-session undo stack.
  app.post<{ Body: BuildTurnRequest }>('/conversation/build', TURN_RATE_LIMIT, async (req, reply) => {
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

  // Redo the most recently undone Build operation; returns its forward patches.
  app.post<{ Body: { sessionId: string } }>('/conversation/redo', async (req, reply) => {
    try {
      const { sessionId } = req.body ?? {};
      if (!sessionId) {
        return reply.status(400).send({ error: 'Missing sessionId', code: 'MISSING_FIELDS' });
      }
      return reply.send(redoBuild(sessionId));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Stream right-panel updates from voice turns to the desktop app as NDJSON.
  // The desktop main process holds this connection open for the app's lifetime
  // and forwards each event to the renderer.
  app.get('/conversation/events', async (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const unsubscribe = subscribePanel(req.ownerId, (evt) => {
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
        await assertRepoOwner(repoId, req.ownerId);
        let githubToken: string | undefined;
        try {
          githubToken = githubTokenFrom(req);
        } catch {
          githubToken = undefined;
        }
        setActiveRepo(req.ownerId, { repoId, repoFullName, githubToken });
        return reply.send({ ok: true });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  // Forget the active repo so Ana starts a session with no stale context
  // (called on app launch and when switching repos before re-indexing).
  app.post('/conversation/reset-context', async (req, reply) => {
    try {
      clearActiveRepo(req.ownerId);
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
