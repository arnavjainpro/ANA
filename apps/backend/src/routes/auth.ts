import type { FastifyInstance } from 'fastify';
import { exchangeCodeForToken, listRepos } from '../services/github.js';
import { issueSessionToken } from '../lib/auth.js';
import { sendError } from '../lib/errors.js';
import { env } from '../lib/env.js';

/** GitHub OAuth endpoints. The backend holds the client secret. */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Public OAuth config the desktop main process needs to build the authorize
  // URL. client_id is public by design; client_secret never leaves the backend.
  app.get('/auth/github/config', async (_req, reply) => {
    return reply.send({
      clientId: env.github.clientId,
      redirectUri: env.github.redirectUri,
      scope: 'repo read:user',
    });
  });

  // Exchange an OAuth code (captured by the desktop deep link) for a token.
  app.post<{ Body: { code: string } }>('/auth/github/exchange', async (req, reply) => {
    try {
      const { code } = req.body ?? {};
      if (!code) {
        return reply.status(400).send({ error: 'Missing code', code: 'MISSING_CODE' });
      }
      const githubToken = await exchangeCodeForToken(code);

      // Identify the user (first repo owner is enough to label the session).
      const repos = await listRepos(githubToken);
      const login = repos[0]?.full_name.split('/')[0] ?? 'user';

      const jwt = issueSessionToken({ sub: login, name: login });
      return reply.send({ githubToken, jwt, login });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
