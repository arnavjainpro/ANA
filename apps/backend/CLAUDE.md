# Ana Backend (CLAUDE.md)

Fastify API server (ESM, Node ≥20). **This is the only place secrets live.** The desktop
main process calls it over HTTP at `http://localhost:8787` (override with
`ANA_BACKEND_URL`). Dev: `npm run dev` (tsx watch). Build: `tsup`.

## Layout

```
src/
  index.ts          Server entry, CORS, route registration, /health.
  routes/           HTTP only — validate input, call a service, return result.
    auth.ts         GitHub OAuth config + code exchange.
    repo.ts         /repo/list, /repo/tree, /repo/index (NDJSON progress stream).
    conversation.ts /conversation/start, /conversation/end, /conversation/turn.
  services/         Business logic, no HTTP concerns.
    github.ts       OAuth exchange, repo list, tree, file contents.
    embeddings.ts   OpenAI text-embedding-3-small (1536-dim).
    indexer.ts      Size check → tree → filter → chunk → embed → pgvector.
    retrieval.ts    Cosine similarity search via the match_chunks RPC.
    claude.ts       Both Claude calls + the static cached system prompts.
    tavus.ts        CVI conversation create/end.
    turn.ts         Orchestrates the full turn pipeline (Call 1 → RAG → Call 2).
  db/
    client.ts       Supabase service-role client singleton.
    schema.sql      pgvector tables (repos, chunks) + match_chunks function.
  lib/              env, errors (AppError + sendError), auth (JWT, token header),
                    chunking (512/64 sliding window), fileFilter, types.
```

## Conventions

- Every route wraps its body in try/catch and returns via `sendError(reply, err)` on
  failure — `{ error, code }` + HTTP status. Throw `AppError(status, code, message)`
  from services for typed failures.
- Service singletons (Anthropic, OpenAI, Supabase) are lazily constructed and throw a
  clear `*_NOT_CONFIGURED` AppError if their env keys are missing — so the server still
  boots for routes that don't need them.
- **System prompts in `claude.ts` are static** and marked `cache_control: ephemeral`.
  Do not interpolate dynamic content into them — it breaks prompt caching.
- `SUPPORTED_MODES = ['Understand', 'Plan']`. `turn.ts` falls back to `Understand` for
  any unsupported classification.
- Chunking counts whitespace-delimited words as an approximation of tokens (no tokenizer
  dependency); 512-token window, 64-token overlap.

## Database

`schema.sql` must be run once against Supabase Postgres (needs the `vector` extension).
`match_chunks(p_repo_id, query_embedding, match_count)` returns top-k chunks by cosine
similarity scoped to one repo.
