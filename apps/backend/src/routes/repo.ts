import type { FastifyInstance } from 'fastify';
import { listRepos, getRepoTree, getFileContents } from '../services/github.js';
import { indexRepo } from '../services/indexer.js';
import { githubTokenFrom } from '../lib/auth.js';
import { sendError } from '../lib/errors.js';

/** Repo connect, tree fetch, and indexing (with progress streaming). */
export async function repoRoutes(app: FastifyInstance): Promise<void> {
  // List the authenticated user's repos.
  app.get('/repo/list', async (req, reply) => {
    try {
      const token = githubTokenFrom(req);
      const repos = await listRepos(token);
      return reply.send({ repos });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Fetch a repo's file tree (name + path only).
  app.post<{ Body: { fullName: string; branch: string } }>('/repo/tree', async (req, reply) => {
    try {
      const token = githubTokenFrom(req);
      const { fullName, branch } = req.body ?? {};
      if (!fullName) {
        return reply.status(400).send({ error: 'Missing fullName', code: 'MISSING_REPO' });
      }
      const tree = await getRepoTree(token, fullName, branch || 'main');
      return reply.send({ tree });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Fetch the contents of a single file.
  app.post<{ Body: { fullName: string; filePath: string } }>('/repo/file', async (req, reply) => {
    try {
      const token = githubTokenFrom(req);
      const { fullName, filePath } = req.body ?? {};
      if (!fullName || !filePath) {
        return reply
          .status(400)
          .send({ error: 'Missing fullName or filePath', code: 'MISSING_PARAMS' });
      }
      const content = await getFileContents(token, fullName, filePath);
      return reply.send({ content });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Index a repo. Streams progress as newline-delimited JSON (NDJSON) so the
  // desktop main process can relay "Indexing… 34/210 files" to the renderer.
  app.post<{ Body: { fullName: string } }>('/repo/index', async (req, reply) => {
    try {
      const token = githubTokenFrom(req);
      const { fullName } = req.body ?? {};
      if (!fullName) {
        return reply.status(400).send({ error: 'Missing fullName', code: 'MISSING_REPO' });
      }

      reply.raw.setHeader('Content-Type', 'application/x-ndjson');
      reply.raw.setHeader('Cache-Control', 'no-cache');

      const write = (obj: unknown): void => {
        reply.raw.write(`${JSON.stringify(obj)}\n`);
      };

      try {
        const result = await indexRepo(token, fullName, (progress) => {
          write({ type: 'progress', ...progress });
        });
        write({ type: 'done', ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Indexing failed';
        write({ type: 'error', error: message });
      }
      reply.raw.end();
      return reply;
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
