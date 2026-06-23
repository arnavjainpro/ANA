import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './lib/env.js';
import { authRoutes } from './routes/auth.js';
import { repoRoutes } from './routes/repo.js';
import { conversationRoutes } from './routes/conversation.js';
import { completionsRoutes } from './routes/completions.js';
import { configurePersonaFromEnv } from './services/tavus.js';

async function main(): Promise<void> {
  const app = Fastify({
    logger: true,
    bodyLimit: 10 * 1024 * 1024, // 10MB, for file contents in turn requests
  });

  // The desktop app calls this server from the Electron main process.
  await app.register(cors, { origin: true });

  app.get('/health', async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(repoRoutes);
  await app.register(conversationRoutes);
  await app.register(completionsRoutes);

  await app.listen({ port: env.port, host: '0.0.0.0' });
  app.log.info(`Ana backend listening on :${env.port}`);

  // If a public URL is configured, point the Tavus persona at this backend so
  // voice turns route through our LLM override. Best-effort; never blocks boot.
  await configurePersonaFromEnv();
}

main().catch((err) => {
  console.error('Failed to start backend:', err);
  process.exit(1);
});
