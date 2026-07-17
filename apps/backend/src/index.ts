import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './lib/env.js';
import { sessionFrom } from './lib/auth.js';
import { bindOwnerContext } from './lib/usageContext.js';
import { AppError } from './lib/errors.js';
import type { ApiError } from './lib/types.js';
import { getSupabase } from './db/client.js';
import { authRoutes } from './routes/auth.js';
import { repoRoutes } from './routes/repo.js';
import { conversationRoutes } from './routes/conversation.js';
import { completionsRoutes } from './routes/completions.js';
import { projectRoutes } from './routes/project.js';
import { ensurePersona } from './services/tavus.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Tenant id (GitHub user id) set by the session hook; '' on exempt routes. */
    ownerId: string;
  }
}

// Routes that authenticate some other way (or not at all): OAuth bootstrap uses
// the GitHub token, /health is public, and the Tavus LLM endpoint uses the
// ANA_LLM_SECRET bearer check inside its own route.
const SESSION_EXEMPT = new Set([
  '/health',
  '/auth/github/config',
  '/auth/github/exchange',
  '/auth/session',
]);

function isSessionExempt(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return SESSION_EXEMPT.has(path) || path.startsWith('/v1/');
}

const DEV_JWT_SECRET = 'dev-insecure-secret-change-me';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    if (env.jwtSecret === DEV_JWT_SECRET) {
      throw new Error('JWT_SECRET must be set to a strong value in production.');
    }
    if (!env.ana.llmSecret) {
      throw new Error('ANA_LLM_SECRET must be set in production so /v1/chat/completions is not open.');
    }
  }

  const app = Fastify({
    logger: true,
    bodyLimit: 10 * 1024 * 1024, // 10MB, for file contents in turn requests
  });

  // Callers are the Electron main process (Node) and Tavus servers; no browser
  // ever talks to this API, so cross-origin access is simply disabled.
  await app.register(cors, { origin: false });

  app.decorateRequest('ownerId', '');

  // Session auth. Registered before the rate limiter so limits key on the
  // authenticated tenant rather than the IP wherever possible.
  app.addHook('onRequest', async (req) => {
    if (isSessionExempt(req.url)) return;
    const claims = sessionFrom(req);
    req.ownerId = claims.sub;
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ownerId || req.ip,
  });

  // Bind the tenant to the request's async context so deep service code
  // (Claude, embeddings) can attribute usage without parameter threading.
  app.addHook('preHandler', (req, _reply, done) => {
    bindOwnerContext(req.ownerId, done);
  });

  // Uniform error contract, including errors thrown from hooks (401s land here).
  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof AppError) {
      const body: ApiError = { error: err.message, code: err.code };
      return reply.status(err.statusCode).send(body);
    }
    const anyErr = err as { statusCode?: unknown; message?: unknown };
    const status = typeof anyErr.statusCode === 'number' ? anyErr.statusCode : 500;
    if (status >= 500) req.log.error(err);
    const body: ApiError =
      status === 429
        ? { error: 'Too many requests. Slow down and try again.', code: 'RATE_LIMITED' }
        : status >= 500
          ? { error: 'Internal server error', code: 'INTERNAL_ERROR' }
          : {
              error: typeof anyErr.message === 'string' ? anyErr.message : 'Request failed',
              code: 'REQUEST_ERROR',
            };
    return reply.status(status).send(body);
  });

  // Liveness always; readiness (DB reachability) with ?deep=1.
  app.get<{ Querystring: { deep?: string } }>('/health', async (req) => {
    if (!req.query.deep) return { ok: true };
    try {
      await getSupabase().from('repos').select('id').limit(1);
      return { ok: true, db: true };
    } catch {
      return { ok: false, db: false };
    }
  });

  await app.register(authRoutes);
  await app.register(repoRoutes);
  await app.register(conversationRoutes);
  await app.register(completionsRoutes);
  await app.register(projectRoutes);

  // Drain connections on deploy/restart instead of cutting streams abruptly.
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`${signal} received, shutting down`);
    void app.close().then(() => process.exit(0));
    // Failsafe if open streams refuse to drain.
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await app.listen({ port: env.port, host: '0.0.0.0' });
  app.log.info(`Ana backend listening on :${env.port}`);

  // Put the persona in a known-good state (native hosted LLM + clean prompt).
  // Best-effort; never blocks boot.
  await ensurePersona();
}

main().catch((err) => {
  console.error('Failed to start backend:', err);
  process.exit(1);
});
