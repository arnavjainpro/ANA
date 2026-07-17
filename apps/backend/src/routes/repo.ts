import type { FastifyInstance } from 'fastify';
import { listRepos, getRepoTree, getFileContents } from '../services/github.js';
import { indexRepo } from '../services/indexer.js';
import { githubTokenFrom } from '../lib/auth.js';
import { AppError, sendError } from '../lib/errors.js';

// Indexing runs embeddings + several Claude calls per repo, so cap concurrency:
// at most 2 jobs across the process and 1 per tenant.
const MAX_CONCURRENT_INDEX_JOBS = 2;
let runningIndexJobs = 0;
const indexingOwners = new Set<string>();

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

  // Fetch the raw UTF-8 contents of a single file from GitHub.
  app.post<{ Body: { fullName: string; path: string } }>('/repo/file', async (req, reply) => {
    try {
      const token = githubTokenFrom(req);
      const { fullName, path } = req.body ?? {};
      if (!fullName || !path) {
        return reply.status(400).send({ error: 'Missing fullName or path', code: 'MISSING_PARAMS' });
      }
      const content = await getFileContents(token, fullName, path);
      return reply.send({ content });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Index a repo. Streams progress as newline-delimited JSON (NDJSON) so the
  // desktop main process can relay "Indexing… 34/210 files" to the renderer.
  app.post<{ Body: { fullName: string } }>(
    '/repo/index',
    { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } },
    async (req, reply) => {
      try {
        const token = githubTokenFrom(req);
        const { fullName } = req.body ?? {};
        if (!fullName) {
          return reply.status(400).send({ error: 'Missing fullName', code: 'MISSING_REPO' });
        }
        if (runningIndexJobs >= MAX_CONCURRENT_INDEX_JOBS || indexingOwners.has(req.ownerId)) {
          throw new AppError(
            429,
            'INDEXING_BUSY',
            'An indexing job is already running. Try again in a minute.',
          );
        }

        reply.raw.setHeader('Content-Type', 'application/x-ndjson');
        reply.raw.setHeader('Cache-Control', 'no-cache');

        const write = (obj: unknown): void => {
          reply.raw.write(`${JSON.stringify(obj)}\n`);
        };

        runningIndexJobs += 1;
        indexingOwners.add(req.ownerId);
        try {
          const result = await indexRepo(
            token,
            fullName,
            (progress) => {
              write({ type: 'progress', ...progress });
            },
            req.ownerId,
          );
          write({ type: 'done', ...result });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Indexing failed';
          write({ type: 'error', error: message });
        } finally {
          runningIndexJobs -= 1;
          indexingOwners.delete(req.ownerId);
        }
        reply.raw.end();
        return reply;
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
