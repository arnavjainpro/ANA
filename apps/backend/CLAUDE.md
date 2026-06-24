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
    conversation.ts /conversation/start, /conversation/end, /conversation/turn;
                    Build: /conversation/build, /conversation/undo, /conversation/session/end.
  services/         Business logic, no HTTP concerns.
    github.ts       OAuth exchange, repo list, tree, file contents.
    embeddings.ts   OpenAI text-embedding-3-small (1536-dim).
    indexer.ts      Size check → tree → filter → chunk → embed → pgvector.
    retrieval.ts    Cosine similarity search via the match_chunks RPC.
    claude.ts       All Claude calls + static cached prompts (incl. BUILD prompt).
    tavus.ts        CVI conversation create/end.
    turn.ts         Turn pipelines: processTurn (Understand/Plan) + processBuildTurn /
                    undoBuild / endBuildSession (Build).
    builder.ts      Build patch validation (count/path/secret) + operation ids.
    history.ts      Per-session in-memory Build undo stack (max 50).
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

## Tavus voice: making Ana code-aware (the public tunnel)

For Ana to talk about the user's code, Tavus must call this backend's
`/v1/chat/completions` on every voice turn. **Tavus runs in the cloud and cannot reach
`http://localhost:8787`** — so in dev you must expose this backend over HTTPS and tell the
backend its public URL via `ANA_PUBLIC_URL`:

1. Start the backend (`npm run dev`).
2. Start a tunnel to port 8787, e.g. `ngrok http 8787` (or a Cloudflare tunnel). Copy the
   `https://…` forwarding URL.
3. Set `ANA_PUBLIC_URL` to that URL in `.env` and restart the backend.

On startup, `ensurePersona()` (`services/tavus.ts`) reads `ANA_PUBLIC_URL`:

- **Set** → the persona's `/layers/llm` is pointed at `<ANA_PUBLIC_URL>/v1`, so Tavus routes
  every turn through our streaming, RAG-grounded endpoint. Log line:
  `[tavus] persona using custom LLM at …`.
- **Blank** → falls back to Tavus's native hosted model (fast, but no codebase access).
  Log line: `[tavus] persona using hosted LLM …`.

The URL changes each time an `ngrok` free tunnel restarts — update `.env` and restart the
backend when it does. (Production sets `ANA_PUBLIC_URL` to the deployed origin once.)
