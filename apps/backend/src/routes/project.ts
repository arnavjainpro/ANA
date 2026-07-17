import type { FastifyInstance } from 'fastify';
import { generateScaffold } from '../services/claude.js';
import { validateScaffoldFiles } from '../services/builder.js';
import { createRepo } from '../services/github.js';
import { githubTokenFrom } from '../lib/auth.js';
import { AppError, sendError } from '../lib/errors.js';
import type { ConversationTurn } from '../lib/types.js';

/**
 * New-project creation: scaffold generation (Claude) and GitHub repo creation.
 * The desktop main process owns everything local (writing files, git init/
 * commit/push) — this backend never sees local paths and never pushes.
 */
export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // Generate a complete new-project scaffold from a spoken request.
  app.post<{ Body: { transcript: string; history?: ConversationTurn[] } }>(
    '/project/scaffold',
    // The single most expensive Claude call in the app (16k max_tokens).
    { config: { rateLimit: { max: 6, timeWindow: '1 hour' } } },
    async (req, reply) => {
      try {
        const { transcript, history } = req.body ?? {};
        if (!transcript?.trim()) {
          return reply.status(400).send({ error: 'Missing transcript', code: 'MISSING_TRANSCRIPT' });
        }
        const scaffold = await generateScaffold({ transcript, history: history ?? [] });
        const validation = validateScaffoldFiles(scaffold.files ?? []);
        if (!validation.valid) {
          throw new AppError(422, 'SCAFFOLD_INVALID', validation.reason ?? 'Invalid scaffold.');
        }
        return reply.send(scaffold);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  // Create the repository on the user's GitHub account. Collision handling
  // (name-2 … name-5) lives in createRepo; the FINAL full_name comes back.
  app.post<{ Body: { name: string; description?: string } }>(
    '/project/create-repo',
    async (req, reply) => {
      try {
        const token = githubTokenFrom(req);
        const { name, description } = req.body ?? {};
        if (!name?.trim()) {
          return reply.status(400).send({ error: 'Missing name', code: 'MISSING_NAME' });
        }
        const repo = await createRepo(token, name.trim(), description ?? 'Created with Ana');
        return reply.send(repo);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
