import type { FastifyInstance } from 'fastify';
import { exchangeCodeForToken, getAuthenticatedUser } from '../services/github.js';
import { githubTokenFrom, issueSessionToken } from '../lib/auth.js';
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

      // Identify the actual authenticated user; their stable GitHub id is the
      // tenant key every piece of data is scoped by.
      const user = await getAuthenticatedUser(githubToken);

      const jwt = issueSessionToken({ sub: String(user.id), login: user.login });
      return reply.send({ githubToken, jwt, login: user.login });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Mint a fresh session JWT from a stored GitHub token. Lets the desktop app
  // restore its session on launch without redoing the OAuth dance, and renew
  // after the 12h JWT expiry.
  app.post('/auth/session', async (req, reply) => {
    try {
      const token = githubTokenFrom(req);
      const user = await getAuthenticatedUser(token);
      const jwt = issueSessionToken({ sub: String(user.id), login: user.login });
      return reply.send({ jwt, login: user.login });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
