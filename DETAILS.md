# Ana — Complete Technical Reference

*Exhaustive inventory of the entire codebase as of July 2026, branch `ui-revamp`. Every route, every IPC channel, every component, every store, every constant. This is the "every single detail" document — for a curated pitch-ready summary, see `PROJECT_CONTEXT.md`.*

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [Monorepo layout](#2-monorepo-layout)
3. [Backend — HTTP routes](#3-backend--http-routes)
4. [Backend — the turn pipeline](#4-backend--the-turn-pipeline)
5. [Backend — Claude service (every function)](#5-backend--claude-service-every-function)
6. [Backend — indexing pipeline](#6-backend--indexing-pipeline)
7. [Backend — embeddings + retrieval](#7-backend--embeddings--retrieval)
8. [Backend — Tavus integration](#8-backend--tavus-integration)
9. [Backend — GitHub service](#9-backend--github-service)
10. [Backend — auth/session](#10-backend--authsession)
11. [Backend — database](#11-backend--database)
12. [Backend — panel bus / SSE](#12-backend--panel-bus--sse)
13. [Backend — environment variables](#13-backend--environment-variables)
14. [Backend — history/undo stack](#14-backend--historyundo-stack)
15. [Backend — remaining services](#15-backend--remaining-services)
16. [Desktop — every IPC channel](#16-desktop--every-ipc-channel)
17. [Desktop — main process entry](#17-desktop--main-process-entry)
18. [Desktop — GitHub OAuth flow](#18-desktop--github-oauth-flow)
19. [Desktop — token storage & repo path persistence](#19-desktop--token-storage--repo-path-persistence)
20. [Desktop — filesystem safety & Build-mode writes](#20-desktop--filesystem-safety--build-mode-writes)
21. [Desktop — project creation flow](#21-desktop--project-creation-flow)
22. [Desktop — run/launch feature](#22-desktop--runlaunch-feature)
23. [Desktop — terminal](#23-desktop--terminal)
24. [Desktop — packaging & build config](#24-desktop--packaging--build-config)
25. [Renderer — App.tsx layout](#25-renderer--apptsx-layout)
26. [Renderer — components](#26-renderer--components)
27. [Renderer — UI primitives](#27-renderer--ui-primitives)
28. [Renderer — panels](#28-renderer--panels)
29. [Renderer — Zustand stores](#29-renderer--zustand-stores)
30. [Renderer — design token system](#30-renderer--design-token-system)
31. [Renderer — lib utilities](#31-renderer--lib-utilities)
32. [Renderer — keyboard shortcuts, animation, accessibility](#32-renderer--keyboard-shortcuts-animation-accessibility)
33. [Cross-cutting design patterns](#33-cross-cutting-design-patterns)
34. [Known inconsistencies](#34-known-inconsistencies)

---

## 1. Product overview

Ana is a voice-first AI coding partner for non-technical people. A user connects a GitHub repo, talks to a photorealistic AI face (Tavus CVI) in real time, and Ana explains, plans, and builds alongside them while a dynamic right-hand panel shifts with the conversation mode.

**Live modes**: Understand (architecture diagrams), Plan (story/task canvas), Build (Monaco editor with direct-to-disk patches). **Not built**: Debug mode, Review mode, multi-repo support, persistent cross-session history, monetization/billing.

**Target latency**: under 1000ms end-to-end per conversational turn.

---

## 2. Monorepo layout

```
apps/
  backend/   Fastify API server. Holds ALL secrets. Talks to GitHub, OpenAI,
             Anthropic, Tavus, Supabase.
  desktop/   Electron app. main (Node) + preload (contextBridge) + renderer (React).
```

Root scripts (`package.json`): `dev` (concurrently runs both workspaces), `build`, `package` (desktop only), `typecheck` (both workspaces). Node engine requirement: `>=20`.

---

## 3. Backend — HTTP routes

**Global setup** (`index.ts`): Fastify, `logger: true`, `bodyLimit: 10MB`. CORS `origin: true` (reflects any origin — only the Electron main process calls it). `GET /health` → `{ok:true}`. Listens on `env.port` (default 8787), host `0.0.0.0`. Calls `ensurePersona()` after listen (best-effort, non-blocking).

**Error convention**: every route wrapped in try/catch, failures go through `sendError(reply, err)` — `AppError` instances respond `{error, code}` at `err.statusCode`; anything else responds `{error, code:'INTERNAL_ERROR'}` at 500. Missing-field validation returns 400 directly (not via `sendError`).

### `auth.ts`
- `GET /auth/github/config` → `{clientId, redirectUri, scope:'repo read:user'}`, no auth.
- `POST /auth/github/exchange` body `{code}` → exchanges via `exchangeCodeForToken`, derives `login` from the first listed repo's owner (fallback `'user'`), issues a JWT. Returns `{githubToken, jwt, login}`.

### `repo.ts` (all require `x-github-token` header)
- `GET /repo/list` → `{repos}`.
- `POST /repo/tree` body `{fullName, branch}` (branch defaults `'main'`) → `{tree}`.
- `POST /repo/file` body `{fullName, path}` → `{content}`.
- `POST /repo/index` body `{fullName}` → NDJSON stream: `{type:'progress', processed, total, currentFile}` lines, then `{type:'done', repoId, filesIndexed, chunksStored, filesSkipped}` or `{type:'error', error}`.

### `conversation.ts`
- `POST /conversation/start` → `createConversation()` (Tavus), no body.
- `POST /conversation/end` body `{conversationId}` → ends if present, else no-op.
- `POST /conversation/turn` body `TurnRequest & {repoFullName?}` — requires `repoId`+`utterance` (400 otherwise). Calls `processTurn`.
- `POST /conversation/build/plan` body `BuildTurnRequest` — requires `transcript`. Calls `planBuildTurn` (Build phase 1).
- `POST /conversation/build` body `BuildTurnRequest` — requires `sessionId`+`transcript`. Calls `processBuildTurn` (Build phase 2).
- `POST /conversation/undo` body `{sessionId}` → `undoBuild` (sync).
- `POST /conversation/redo` body `{sessionId}` → `redoBuild` (sync).
- `GET /conversation/events` → hijacked NDJSON stream from `subscribePanel`, keep-alive blank line every 25,000ms.
- `POST /conversation/active-repo` body `{repoId, repoFullName?}` — requires `repoId`. Calls `setActiveRepo`.
- `POST /conversation/reset-context` → `clearActiveRepo()`.
- `POST /conversation/session/end` body `{sessionId}` → `endBuildSession` if provided.

### `completions.ts` — `POST /v1/chat/completions` (Tavus-facing, OpenAI-compatible)
Body `{model, messages, stream}`. If `env.ana.llmSecret` set, requires `Authorization: Bearer <secret>` (401 otherwise). Last `role==='user'` message is the transcript; everything before (minus system messages) is history.

Hand-rolled SSE via `reply.hijack()` — `text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`. Opens with an empty assistant-role chunk, pings `: ping\n\n` every 15,000ms.

Branches on `getActiveRepo()`:
- **Repo active**: parallel `classifyIntent` + `retrieveChunks` + `getProjectMap` + `getArchitectureSummary`. Priority-ordered intent branches: `undo` → `redo` → `createProject` → `runAction` → `terminalCommand` → `mode==='Build'` → spoken reply default. Each non-default branch publishes a bus event and speaks a randomized ack line (3–5 variants per category: `BUILD_ACKS`, `UNDO_ACKS`, `REDO_ACKS`, `TERMINAL_ACKS`, `CREATE_ACKS`). Default branch fires `publishPanelInBackground` (fire-and-forget diagram/panel resolution) and streams `streamSpokenReply` deltas directly into SSE.
- **No repo active**: parallel `classifyIntent` (swallowed on failure) + `generateNoRepoReply`; if create/build intent detected, publishes a create-project request; else streams the no-repo guidance reply.

On any error: writes `SPOKEN_FALLBACK = "I ran into an issue — can you try again?"`. Always closes with a `finish_reason:'stop'` chunk + `data: [DONE]\n\n`.

### `project.ts`
- `POST /project/scaffold` body `{transcript, history?}` — requires non-empty transcript. Calls `generateScaffold`, validates via `validateScaffoldFiles` (throws 422 `SCAFFOLD_INVALID` if not launchable).
- `POST /project/create-repo` body `{name, description?}` — requires GitHub token + non-empty name. Calls `createRepo`.

---

## 4. Backend — the turn pipeline

`SUPPORTED_MODES = ['Understand', 'Plan']` — anything else classified falls back to `'Understand'`. Build runs a separate two-phase pipeline.

### `processTurn(req, options)`
1. `intent = precomputedIntent ?? classifyIntent(...)` (Haiku Call 1).
2. `mode = req.forcedMode ?? intent.mode`, forced to `'Understand'` if unsupported.
3. `chunks = retrieveChunks(repoId, utterance)` (top-5).
4. If a target file is named and has an extension + token/repoFullName exist, fetches full contents (non-fatal on failure).
5. If `mode==='Understand' && intent.wantsDiagram`, kicks off `resolveDiagramView` in parallel.
6. `Promise.all([generateResponse (Sonnet Call 2), diagramViewPromise])`.
7. If a canonical diagram view resolved and the response's panel is `'diagram'`, overwrites the payload with the canonical (cached/frozen) one — keeps text-turn diagrams stable with voice-turn diagrams.
8. Never throws — any error returns a fallback `{mode, spoken: SPOKEN_FALLBACK, panel:'diagram', payload:{mermaid:'graph TD; A[Not enough context]'}}`.

### `candidateTargets(intentTarget, chunks)`
Build-mode file picker: named target first (if it has an extension), then up to 5 unique RAG-chunk paths, capped at 5 total.

### `planBuildTurn(req)` — Build phase 1
`classifyIntent` → `retrieveChunks` → `{paths: candidateTargets(...)}`. Never throws (falls back to `{paths:[]}`).

### `processBuildTurn(req, options)` — Build phase 2
1. `classifyIntent`, `retrieveChunks`.
2. Resolves file contents: prefers client-supplied disk contents (`req.files`, ground truth so patches match what's actually on disk) over re-fetching from GitHub.
3. `generateBuildResponse` (Sonnet, tool-forced).
4. Empty `response.files` → `{spoken: response.spoken || BUILD_FALLBACK, patches:[], operationId:''}`. `BUILD_FALLBACK = "I couldn't make that change just now — can you try rephrasing it?"`.
5. `assemblePatches` turns per-file search/replace edit groups into full-file `FilePatch`es; empty result → fixed "couldn't find the exact spot" message.
6. `validatePatches` — invalid → returns the validation reason as spoken text, no patches.
7. Builds summary (single file, or `"{summary} (N files)"` for multi-file).
8. New `operationId` (UUID), pushed onto the per-session undo stack, redo stack cleared.
9. Error handling: `AppError` code `CLAUDE_BAD_JSON` → "That file's a bit too big for me to rewrite all at once…"; anything else → `SPOKEN_FALLBACK`. Never throws.

### `undoBuild(sessionId)` / `redoBuild(sessionId)`
Pop undo → push redo (reversing `original`↔`updated`, spoken `'Undone.'`), or pop redo → push undo (patches unchanged, spoken `'Redone.'`). Empty stack → `'There is nothing to undo/redo.'`.

### `endBuildSession(sessionId)`
`history.clear(sessionId)`.

---

## 5. Backend — Claude service (every function)

**Models** (exact constants): `CLASSIFY_MODEL = 'claude-haiku-4-5'`, `REASONING_MODEL = 'claude-sonnet-4-6'`, `SPEECH_MODEL = 'claude-haiku-4-5'` (its own constant, intended swappable to Sonnet after latency measurement).

Every system prompt is a single static string with `cache_control: {type:'ephemeral'}` — never interpolated (dynamic content always goes in the user message) to preserve prompt-cache hits.

1. **`classifyIntent(utterance, history)`** — Call 1. `max_tokens:256`. Returns `{mode, intent, target, undo, redo, wantsDiagram, diagramScope, diagramSubject, diagramDepth, createProject, projectName, runAction, terminalCommand}`.
2. **`generateResponse(params)`** — Call 2 (Understand/Plan). `max_tokens:2000`. Mode-specific system prompt. Returns `{spoken, panel, payload}`.
3. **`streamSpokenReply(params)`** (async generator) — `max_tokens:1024`. System prompt reused verbatim as the Tavus persona's fallback system prompt. Plain-text streaming, no JSON.
4. **`generateArchitectureSummary(params)`** — index-time, one-shot. `max_tokens:600`, `temperature:0` (deterministic, feeds diagrams).
5. **`generateModuleSummaries(map, getHead)`** — `max_tokens:100`, `temperature:0`. `MODULE_SUMMARY_CONCURRENCY=4`, `MAX_SUMMARIZED_MODULES=20` (only the 20 largest modules by file count, batched 4-at-a-time via `Promise.allSettled` — individual failures logged and skipped).
6. **`generateOverviewDiagram(params)`** — `max_tokens:1500`, `temperature:0`. Two depths: `'basic'` (5–8 nodes, ≤2 subgraph layers) or `'deep'` (12–18 nodes, 2–4 layers). Contract: must start `flowchart LR`, node IDs = module-map IDs verbatim, 6 semantic node classes (`:::entrypoint/:::service/:::datastore/:::external/:::module/:::decision`).
7. **`generateDetailDiagram(params)`** — `max_tokens:1500`, `temperature:0`. Centers on one named component's internals, cap 12 nodes.
8. **`generateBuildResponse(params)`** — Call 2 (Build). `max_tokens:16000`. **Tool-forced**: `tools:[BUILD_TOOL]`, `tool_choice:{type:'tool', name:'submit_edits'}` → `{spoken, files:[{path, summary, edits:[{oldString, newString}]}]}`. Rules baked into the prompt: smallest possible snippet edits (never whole-file rewrites except new files, where `oldString:''`), max 5 files/operation, never touches `.env`/`tsconfig`/`package.json` unless explicitly asked, no new dependencies. History window widened to 14 turns (vs default 6) so a build following a planning chat still has that context. Throws `AppError(502,'CLAUDE_BAD_JSON')` if no `tool_use` block returned.
9. **`generateScaffold(params)`** — `max_tokens:16000`. Tool-forced (`submit_scaffold`) → `{projectName, description, spoken, files:[{path, contents, summary}]}`. Max 15 files, must be launchable (root `index.html` or `package.json` with a `dev`/`start` script), no secrets/`node_modules`/lockfiles/binaries. `projectName` sanitized: lowercased, non-`[a-z0-9-]` collapsed to `-`, trimmed, capped 60 chars, fallback `'new-project'`.
10. **`generateNoRepoReply(params)`** — `max_tokens:256`. 4-step "connect a repo" guidance, plain speech.
11. `SPOKEN_FALLBACK` and `SPEECH_SYSTEM_PROMPT` are exported consts (the latter reused directly by `tavus.ts` as the persona's system prompt — single source of truth).

**Helpers**: `parseJsonObject<T>` strips code fences, extracts first-`{`-to-last-`}` substring, throws `CLAUDE_BAD_JSON` on failure. `blockText` joins text content blocks. `formatHistory(history, maxTurns=6)` (Build overrides to 14). `formatChunks`/`formatFiles` label context blocks with file-path headers.

---

## 6. Backend — indexing pipeline

`MAX_REPO_SIZE_KB = 50 * 1024` (50MB hard cap on `repo.size` from GitHub, throws `AppError(413,'REPO_TOO_LARGE')`). `EMBED_BATCH_SIZE = 64`.

**`indexRepo(token, fullName, onProgress)` — exact sequence**:
1. `getRepo` (metadata + size check).
2. Upsert `repos` row (`onConflict:'github_id'`) with `github_id, full_name, default_branch, size_kb`.
3. `DELETE FROM chunks WHERE repo_id = repoId` — full clean re-index every time, never incremental.
4. `getRepoTree` (recursive) filtered to `type==='file' && isIndexable(path)`.
5. Sequential per-file loop: report progress, fetch contents, feed to the module-map collector (import extraction), `chunkText`; zero chunks → counted skipped. Else embed+insert in 64-chunk batches. Per-file failures caught/logged/skipped — never abort the job.
6. Final progress report, `repos.indexed_at = now()`.
7. Invalidates caches: project map, architecture summary, module map, diagram cache (memory + DB).
8. `buildModuleMap` (best-effort): finalizes collector → `ModuleMap`, runs `generateModuleSummaries`, persists.
9. `buildArchitectureSummary` (best-effort): renders structure, fetches README (≤4000 chars) + `package.json` (≤3000 chars), calls `generateArchitectureSummary`, persists.
10. `buildOverviewDiagrams` (best-effort, both depths independently): calls `generateOverviewDiagram`, persists via `setDiagram` — **overview diagrams are frozen at index time and reused verbatim thereafter**.

Returns `{repoId, filesIndexed, chunksStored, filesSkipped}`.

**Chunking** (`lib/chunking.ts`): `WINDOW_TOKENS=512`, `OVERLAP_TOKENS=64`, step=448. Tokens approximated as whitespace-delimited words (no real tokenizer). Sliding window, trims/drops empties.

**File filter** (`lib/fileFilter.ts`) — `isIndexable(path)`:
- Excluded dirs (substring match): `node_modules/`, `.git/`, `dist/`, `build/`, `out/`, `.next/`, `coverage/`.
- Excluded extensions: binaries (`.exe .dll .so .dylib .bin .wasm .o .a .class`), images (`.png .jpg .jpeg .gif .bmp .ico .svg .webp .tiff`), media (`.mp3 .mp4 .mov .avi .wav .webm .ogg`), archives (`.zip .tar .gz .rar .7z`), fonts/docs (`.woff .woff2 .ttf .eot .pdf`).
- Excluded files: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, and any `.lock` extension generically.
- No per-file size cap — only the whole-repo 50MB cap.

---

## 7. Backend — embeddings + retrieval

**`services/embeddings.ts`**: `EMBEDDING_MODEL='text-embedding-3-small'`, `EMBEDDING_DIM=1536`. `embedBatch(inputs)` — one OpenAI call per batch. `embedQuery(input)` wraps a single-item batch, throws `AppError(502,'EMBEDDING_FAILED')` if nothing returned.

**`services/retrieval.ts`**: `DEFAULT_TOP_K=5` (comment notes a spec to drop to 3 if retrieval exceeds a 50ms budget — not actually implemented as adaptive). `retrieveChunks(repoId, query, topK=5)` embeds the query, calls Supabase RPC `match_chunks`. On RPC error, logs and returns `[]` — never throws.

**Similarity**: cosine via pgvector's `<=>` operator, `similarity = 1 - distance`, backed by an `ivfflat` index (`lists=100`, `vector_cosine_ops`).

---

## 8. Backend — Tavus integration

`TAVUS_API = 'https://tavusapi.com/v2'`. `DEFAULT_REPLICA_ID = 'r3f427f43c9d'` ("Gloria - Warm" stock replica), used unless `TAVUS_REPLICA_ID` env is set.

- **`reclaimConcurrencySlots()`** — lists all non-`'ended'` conversations, ends them in parallel. Best-effort, run automatically before every `createConversation()` since Tavus's account tier caps concurrent conversations.
- **`repoContext()`** — one-time `conversational_context` string naming the active repo, for Tavus's native LLM fallback awareness.
- **`createConversation()`** — requires `TAVUS_API_KEY`+`TAVUS_PERSONA_ID`. Reclaims slots first, then `POST /conversations` with `{replica_id, persona_id, conversation_name:'Ana session', custom_greeting, conversational_context?}`. Two greetings: `NO_REPO_GREETING`, `REPO_GREETING`.
- **`endConversation(conversationId)`** — `POST /conversations/{id}/end`, no-op without a key, swallows fetch errors ("stop metering").
- **LLM-override mechanism** (`buildLlmLayer()`): if `ANA_PUBLIC_URL` set, points Tavus's persona LLM layer at `${publicUrl}/v1/chat/completions` with `api_key: ANA_LLM_SECRET || 'ana-dev-key'`. Else falls back to Tavus's own hosted `tavus-claude-haiku-4.5` model.
- **`CONVERSATIONAL_FLOW`** (pinned, not left to dashboard state): `{turn_detection_model:'sparrow-1', turn_taking_patience:'medium', replica_interruptibility:'high', voice_isolation:'near', idle_engagement:'off'}`.
- **`ensurePersona()`** — runs once at server startup. JSON-Patch (`PATCH /personas/{id}`) replacing `/system_prompt` (= `SPEECH_SYSTEM_PROMPT` from `claude.ts`, single source of truth), `/layers/llm`, `/layers/conversational_flow`, `/default_replica_id`. Never throws — logs a warning on failure.

**Conversation lifecycle**: create (with concurrency reclaim) → Tavus streams voice, calling this backend's `/v1/chat/completions` per-turn when custom-LLM wired → end (via `/conversation/end`) stops metering. **No idle timeout exists** — see the earlier cost analysis in this conversation for the financial implication of that gap.

---

## 9. Backend — GitHub service

`GITHUB_API = 'https://api.github.com'`. Internal `gh<T>()` helper sets `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`; errors pass through 404/422, else wrapped as 502 `GITHUB_API_ERROR`.

- `exchangeCodeForToken(code)` — `POST github.com/login/oauth/access_token`. Requires configured client id/secret.
- `listRepos(token)` — `GET /user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator`.
- `getRepo(token, fullName)`, `getAuthenticatedUser(token)`.
- `createRepo(token, name, description)` — `POST /user/repos` with `{private:false, auto_init:false}`. On 422 name collision, retries with `-2`…`-5` suffixes (5 attempts total), then throws `AppError(409,'REPO_NAME_TAKEN')`.
- `getRepoTree(token, fullName, branch)` — recursive git tree API; 404 (empty repo) treated as `[]`.
- `getFileContents(token, fullName, filePath)` — decodes base64 to UTF-8; throws `AppError(404,'FILE_NOT_FOUND')` if empty.

**OAuth**: desktop gets `clientId`/`redirectUri`/`scope` from `/auth/github/config`, builds the authorize URL itself, captures the code via deep link (`ana://auth` default), POSTs it to `/auth/github/exchange`. Backend holds `client_secret`, never exposed. Scope: `repo read:user`.

---

## 10. Backend — auth/session

- `issueSessionToken({sub, name})` — `jwt.sign(claims, env.jwtSecret, {expiresIn:'12h'})`. `env.jwtSecret` defaults to the **insecure literal** `'dev-insecure-secret-change-me'` if `JWT_SECRET` is unset.
- `githubTokenFrom(req)` — reads `x-github-token` header, throws `AppError(401,'NO_GITHUB_TOKEN')` if absent.
- **No JWT verification middleware exists** — the JWT is issued after OAuth exchange but nothing validates it on subsequent requests. Auth for GitHub-backed routes runs entirely on the raw `x-github-token` header; the JWT appears to be desktop-side session bookkeeping only, not an enforced backend gate.

---

## 11. Backend — database

**Client**: `getSupabase()` singleton, `createClient(url, serviceKey, {auth:{persistSession:false}})`. Uses the **service-role key** (full DB access, not row-level-security scoped).

**Schema** (`db/schema.sql`, requires the `pgvector` extension):
- `repos`: `id uuid PK`, `github_id bigint unique`, `full_name text`, `default_branch text default 'main'`, `head_sha text`, `size_kb integer default 0`, `indexed_at timestamptz`, `architecture_summary text`, `module_map jsonb`, `created_at`.
- `repo_diagrams`: `id uuid PK`, `repo_id uuid FK → repos cascade`, `cache_key text` (`overview:basic`, `overview:deep`, `detail:<subject>`), `payload jsonb`, unique `(repo_id, cache_key)`.
- `chunks`: `id uuid PK`, `repo_id uuid FK cascade`, `file_path text`, `chunk_index integer`, `content text`, `embedding vector(1536)`. `ivfflat` index (`vector_cosine_ops`, `lists=100`).
- `match_chunks(p_repo_id, query_embedding, match_count)` SQL function — returns `(file_path, content, similarity)`, cosine distance ordered ascending, scoped by `repo_id`.

---

## 12. Backend — panel bus / SSE

In-process pub/sub (plain `Set<Listener>`, no external broker) bridging voice turns to the desktop app via `GET /conversation/events`. Discriminated union `BusEvent`:
- `PanelEvent {type:'panel', mode, spoken, panel, payload, view?, focusSubject?}`
- `BuildRequestEvent {type:'build-request', transcript, history}`
- `UndoRequestEvent {type:'undo-request'}` / `RedoRequestEvent {type:'redo-request'}`
- `CreateProjectRequestEvent {type:'create-project-request', transcript, history}`
- `RunRequestEvent {type:'run-request', action:'launch'|'stop'}`
- `TerminalRequestEvent {type:'terminal-request', command}`

Route hijacks the reply, writes NDJSON lines, keep-alive blank line every 25,000ms, unsubscribes on close. Desktop main process holds this connection open for the app's lifetime.

---

## 13. Backend — environment variables

`.env` located by walking up to 6 parent directories from cwd (works from repo root or `apps/backend`), loaded via `dotenv`.

| Var | Default | Required? | Purpose |
|---|---|---|---|
| `PORT` | `'8787'` | no | Fastify port |
| `JWT_SECRET` | insecure literal | should be set in prod | Signs session JWTs |
| `GITHUB_CLIENT_ID` | `''` | required for OAuth | OAuth app id |
| `GITHUB_CLIENT_SECRET` | `''` | required for OAuth | OAuth app secret |
| `GITHUB_REDIRECT_URI` | `'ana://auth'` | no | Deep-link redirect |
| `ANTHROPIC_API_KEY` | `''` | required for Claude | Anthropic auth |
| `OPENAI_API_KEY` | `''` | required for embeddings | OpenAI auth |
| `SUPABASE_URL` | `''` | required for DB | Project URL |
| `SUPABASE_SERVICE_KEY` | `''` | required for DB | Service-role key |
| `TAVUS_API_KEY` | `''` | required for Tavus | API key |
| `TAVUS_REPLICA_ID` | `''` (falls back to `r3f427f43c9d`) | no | Face replica |
| `TAVUS_PERSONA_ID` | `''` | required for Tavus | Persona id |
| `ANA_PUBLIC_URL` | `''` | no | Public HTTPS URL (tunnel) so Tavus can reach `/v1/chat/completions`; blank → Tavus's hosted model |
| `ANA_LLM_SECRET` | `''` | no | Bearer secret for the completions route + persona LLM layer's `api_key` |

---

## 14. Backend — history/undo stack

Per-session **in-memory** undo/redo (`services/history.ts`), two `Map<sessionId, BuildOperation[]>`. **Nothing persisted** — lost on backend restart. `MAX_STACK_DEPTH=50` (trims from the front). `BuildOperation = {operationId, timestamp, patches, summary}`.

Functions: `push`, `pop`, `peek`, `pushRedo`, `popRedo`, `clearRedo` (called after any fresh Build change), `clear` (called on session end).

---

## 15. Backend — remaining services

- **`services/builder.ts`** — the safety net (never writes to disk itself; the desktop re-checks these rules independently). `MAX_FILES=5` per operation. Forbidden patterns: `.env*`, `*.key/.pem/.p12/.cert/.secret`, anything under `.git/` or `node_modules/`. `isUnsafePath` rejects empty/absolute/`..`-containing paths. `MAX_SCAFFOLD_FILES=15`, launchability contract enforced (`dev`/`start`/`preview` script or root `index.html`). `applyEdits`/`assemblePatches`: each `oldString` must match exactly once (ambiguous/missing → failure), CRLF normalized before comparing.
- **`services/activeRepo.ts`** — in-memory singleton `{repoId, repoFullName?, githubToken?}` so the Tavus-facing completions route (no per-call `repoId`) knows what to RAG against. Repopulated after a backend restart because the desktop re-announces it on index/every text turn.
- **`services/architectureSummary.ts`** — read-through cache (`Map<repoId,string>`) in front of `repos.architecture_summary`. Memory-first, DB fallback, never throws.
- **`services/diagramCache.ts`** — read-through cache of frozen diagram artifacts. `normalizeSubject` squashes subject strings to `[a-z0-9]+` lowercase so `"Auth API"`/`"AuthAPI"`/`"auth-api"` collide to the same cache key. Memory-first, DB-backed persistence, best-effort.
- **`services/diagramView.ts`** — decides which diagram a turn should show, and when NOT to redraw. `lastSubject: Map<repoId,string>` tracks the in-view component per repo so unqualified follow-ups resolve against it. Returns `null` if `!intent.wantsDiagram` (holds current view). Never throws.
- **`services/moduleMap.ts`** — deterministic static-analysis pass (ground truth for diagrams, not just RAG hits). `MAX_MODULES=30`, `MIN_FILES_PER_MODULE=3`, `MAX_KEY_FILES=8`, `HEAD_LINES=40`, `HEAD_CHARS=1600`. Import extraction (regex-based) for JS/TS family, Python, Go, Rust. Entry-point regex: `^(index|main|app|server|cli)\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs)$` for shallow files, plus `package.json` `main`/`bin`.
- **`services/projectMap.ts`** — condensed whole-project outline + README excerpt for bird's-eye context beyond top-5 RAG chunks. `MAX_DEPTH=3`, `MAX_LINES=200`, `README_CHARS=1500`. In-memory cache keyed by `repoFullName`.
- **`lib/types.ts`** — all shared domain types.
- **`lib/errors.ts`** — `AppError extends Error` with `statusCode`+`code`; `sendError` is the single response convention used by every route.

---

## 16. Desktop — every IPC channel

All handlers via `ipcMain.handle`; every response is `payload | {error: string}`. **37 invoke channels total**, 7 push-only event channels.

### auth (`ipc/auth.ts`)
- `auth:connectGitHub` → `{login}` or error.
- `auth:status` → `{connected, login}` (no error variant — falls back to disconnected on throw).

### repo (`ipc/repo.ts`)
- `repo:list`, `repo:tree(fullName, branch)`, `repo:fileContent(fullName, path)` — proxy to backend with the GitHub token header.
- `repo:index(fullName)` — streams NDJSON via raw fetch (not the JSON helper), forwards each progress line as push event **`repo:index-progress`**; on completion, best-effort `POST /conversation/active-repo`.

### conversation (`ipc/conversation.ts`)
- `conversation:start` — ends any active conversation first (Tavus concurrency cap), then starts.
- `conversation:end(conversationId?)`, `conversation:turn(TurnRequest)`, `conversation:resetContext`, `conversation:syncRepo({repoId, repoFullName?})`.
- **`startPanelStream(window)`** (not an ipcMain handler — called directly from `main/index.ts`) opens the long-lived `GET /conversation/events` NDJSON connection, forwards each event as push **`conversation:panel`**. Auto-reconnects every 2s on drop. This is how voice turns (which hit the backend directly, bypassing the renderer) deliver panel/build/undo/run/terminal events into the UI.

### fs (`ipc/filesystem.ts`)
- `fs:readFile(repoPath, relPath)`, `fs:writeFile(repoPath, relPath, contents)`, `fs:listDir(repoPath)`, `fs:getRepoRoot`.

### git (`ipc/git.ts`)
- `git:stage(repoPath, paths[])` — **registered but not exposed in preload** (dead/internal-only; only the exported `stagePaths()` function is used, by `build.ts`).
- `git:getStatus(repoPath)` — exposed as `ana.git.status()`, invoking channel `'git:getStatus'` (method/channel names diverge — see §34).

### build (`ipc/build.ts`)
- `build:getRepoPath(fullName)`, `build:selectRepoPath(fullName)` (folder picker + validation), `build:turn(BuildTurnRequest)` (two-phase: backend plan → read local disk → backend reason → apply → stage), `build:undo(sessionId, repoPath)`, `build:redo(sessionId, repoPath)`, `build:endSession(sessionId)`.

### project (`ipc/project.ts`)
- `project:scaffold(transcript, history)`, `project:selectParentDir(projectName)` (directory picker), `project:create(...)` (see §21). Push event **`project:progress`**.

### run (`ipc/run.ts`)
- `run:launch(repoPath)`, `run:stop(repoPath?)`, `run:status(repoPath)` (returns `RunStatus` directly, not wrapped). Push event **`run:progress`**.

### terminal (`ipc/terminal.ts`)
- `terminal:create(cwd?)`, `terminal:write(id, data)` (raw passthrough, unfiltered), `terminal:run(id, command)` (dangerous-command guard applied — this is the only filtered path), `terminal:resize(id, cols, rows)`, `terminal:kill(id)`. Push events **`terminal:data`**, **`terminal:exit`**.

### window (`ipc/window.ts`)
- `window:setMode(next)`, `window:getMode` (sync, no error path), `window:setPopupExpanded(expanded)`. Push event **`window:mode-changed`** (fires on every mode/expansion change, including via the global shortcut).

---

## 17. Desktop — main process entry (`src/main/index.ts`)

- **Single-instance lock**: `app.requestSingleInstanceLock()`; if not obtained, quits immediately.
- **`second-instance`**: extracts a deep link from `argv`, calls `handleAuthCallback`, restores/focuses the window — how Windows/Linux deep links reach an already-running app.
- **`open-url`**: macOS-native deep-link delivery.
- **`registerDeepLink()`**: `app.setAsDefaultProtocolClient('ana', ...)`, dev-mode special-case on Windows.
- **Media permissions**: auto-grants only `'media'` (camera/mic) requests via `setPermissionRequestHandler`, needed for the Tavus/Daily iframe's `getUserMedia`. macOS also triggers native prompts via `systemPreferences.askForMediaAccess`.
- **`createWindow()`**: resets window mode to `'full'` first. `BrowserWindow`: 1280×800, min 960×640, `backgroundColor:'#131316'`, `titleBarStyle:'hidden'` (frameless). macOS traffic lights at `{x:16,y:18}`; Windows/Linux `titleBarOverlay` config. `contextIsolation:true`, `nodeIntegration:false`, `sandbox:false`, `autoplayPolicy:'no-user-gesture-required'` (so Ana's audio plays without a gesture). Loads dev server or `dist/index.html`. Starts the panel stream.
- **Startup order**: `registerDeepLink` → `setupMediaPermissions` → register every IPC domain (auth, repo, conversation, filesystem, git, build, window, project, run, terminal) → `createWindow` → register global popup shortcut → handle any deep link in initial argv → register `activate` handler.
- **`window-all-closed`**: quits unless macOS.
- **`before-quit`**: always `stopAllRuns()` + `killAllTerminals()` first. If a Tavus conversation is active, prevents default, ends it, *then* quits — guarantees the Tavus concurrency slot is freed before exit.

---

## 18. Desktop — GitHub OAuth flow (`src/main/github/oauth.ts`)

Two callback strategies, chosen by the backend's configured redirect URI:

- **Loopback HTTP** (default — GitHub OAuth Apps only allow http/https callbacks): spins up a one-shot `node:http` server on the redirect URI's host/port, matches the exact pathname, responds with a static success page, self-closes. 5-minute timeout. `EADDRINUSE` gets a friendly message.
- **`ana://` deep link**: stores pending resolve/reject closures with the same timeout; `handleAuthCallback(url)` (called from `open-url`/`second-instance`/initial-argv) resolves/rejects the pending promise.

**End-to-end sequence**:
1. `GET /auth/github/config` → `{clientId, redirectUri, scope}`.
2. Build GitHub's authorize URL with a random `state`.
3. Determine strategy from redirect URI protocol.
4. **Start listening before opening the browser** (comment explicitly notes the redirect would otherwise race the listener).
5. `shell.openExternal(authorizeUrl)`.
6. Await the code.
7. `POST /auth/github/exchange {code}` → `{githubToken, jwt, login}`.
8. Persist via `tokenStore.ts`.

---

## 19. Desktop — token storage & repo path persistence

**Token storage** (`lib/tokenStore.ts`): `github.token.enc` (encrypted) + sibling plaintext `github.login` file, both in `app.getPath('userData')`. `safeStorage.encryptString()` (Keychain/DPAPI). If no OS keychain is available, the token is kept **in-memory only for that session** — never written to disk in plaintext. In-memory cache populated on save or lazy first read.

**Repo path persistence** (`lib/repoPaths.ts`): `repoPaths.json` — plain JSON map `full_name → absolute path` (not a secret). `getStoredRepoPath` confirms the folder still exists on disk before returning it. `validateRepoFolder` reads `.git/config` for a case-insensitive match on `fullName`, falling back to a basename comparison.

---

## 20. Desktop — filesystem safety & Build-mode writes

**Security** (`lib/fsSafe.ts`): `FORBIDDEN_PATTERNS` — `.env`/`.env.*`, `*.key|*.pem|*.p12|*.cert|*.secret`, any `.git/` segment, any `node_modules/` segment. `resolveWithinRoot` blocks `..` traversal and absolute-path escape.

**Atomic write** (`filesystem.ts`): writes to `<path>.ana-tmp`, clears any stale temp, `fs.rename` (atomic on macOS/Windows — a killed process never leaves a partial target). EOL-insensitive change detection (CRLF/LF normalized before comparing) with EOL preservation on write.

**Batch patch application** (`applyPatchesToDisk`) — two-phase, all-or-nothing: Phase 1 validates every patch (forbidden-path check, resolves within root, **stale-write protection**: throws if on-disk content doesn't match `patch.original`) before writing anything; Phase 2 writes them all.

**`readLocalFiles`**: reads given paths from disk, silently skipping forbidden/missing ones — feeds Build's "original must match disk exactly" contract.

**"Max 5 files per operation"**: enforced **entirely backend-side** (`services/builder.ts` + the Claude prompt) — nothing in the desktop app enforces or references this limit; it will apply however many patches the backend hands it.

**Git staging**: after every successful patch apply, `stagePaths()` runs (`simpleGit(repoPath).add(paths)`) — **never a commit**. The sole exception is project creation.

---

## 21. Desktop — project creation flow (`ipc/project.ts`, `project:create`)

**The one place** in the desktop app that does `git init` + commit + push. Exact 7-step sequence:

1. **Slug + directory**: sanitized slug (lowercase, non-`[a-z0-9-]`→`-`, 60-char cap), probes `<parentDir>/<slug>`, then `-2`…`-20` on collision.
2. **Write files**: reuses `applyPatchesToDisk` (same forbidden-path defense) with synthesized `original:''` patches. On failure, removes the just-created directory.
3. **`git init` + initial commit**: `git init -b main`; if no local/global `user.email` configured, sets **local-only** fallback identity from the GitHub login (`<login>@users.noreply.github.com`); `git add -A`; `git commit -m 'Initial commit from Ana'`. On failure, files are left on disk (they're the user's work).
4. **Create GitHub repo**: `POST /project/create-repo`, backend handles name collisions.
5. Build a `RepoSummary` from the response.
6. **Push — the one-shot authenticated URL**: `git remote add origin` with a clean token-free URL (what persists in `.git/config`). Push uses a **positional URL argument** with the token embedded (`https://x-access-token:<token>@github.com/...`) that's **never written to `.git/config`**. On push failure, the error message is scrubbed of any credentialed URL before being surfaced.
7. **Persist locally**: `setStoredRepoPath` so Build/Run resolve the path immediately.

Returns `{repoPath, repo, owner, htmlUrl, warning?}` — `warning` (not a hard error) when everything succeeded except the final push.

Progress channel `project:progress` fires at 4 stages: `writing`, `committing`, `creating-repo`, `pushing`.

---

## 22. Desktop — run/launch feature (`ipc/run.ts`)

Module-level `runs: Map<repoPath, ManagedRun>`.

**`run:launch`**:
1. If already running, just re-opens the cached URL (idempotent "show me").
2. Reads `package.json`.
3. **Script detection priority**: `dev` → `start` → `preview` → none.
4. **Static fallback**: no runnable script but a root `index.html` exists → `shell.openPath`, returns `{url:null, kind:'static'}`. Neither → friendly "nothing runnable" error.
5. **Dependency install**: if deps declared and `node_modules` missing, emits `{stage:'installing'}`, spawns `npm install`, waits for success.
6. **Start**: emits `{stage:'starting'}`, spawns `npm run <script>`. POSIX uses `detached:true` so the whole process group (npm→node→vite etc.) can be killed together via negative PID; Windows uses `npm.cmd` with `shell:true`.
7. **URL detection**: watches stdout/stderr for a `localhost`/`127.0.0.1`/`0.0.0.0` URL pattern; 30-second timeout, then guesses the conventional port (5173 if vite in deps, else 3000) and probes it with a 3s-timeout fetch.
8. On resolved URL: `shell.openExternal`, emits `{stage:'ready', detail:url}`.

**`killRun`**: Windows `taskkill /pid <pid> /T /F`; POSIX `SIGTERM` to the negative PID (process group). `stopAllRuns()` (called from `before-quit`) kills every managed run.

---

## 23. Desktop — terminal (`ipc/terminal.ts`)

Module-level `sessions: Map<id, IPty>`.

**`terminal:create`**: default cwd priority `cwd || getCurrentRepoRoot() || homedir()`. Shell: `COMSPEC || 'powershell.exe'` (Windows) or `SHELL || '/bin/zsh'` (POSIX, login shell via `-l`). `pty.spawn(shell, args, {name:'xterm-256color', cols:80, rows:24, cwd, env: process.env})`.

**`terminal:write`**: raw passthrough — "same trust boundary as opening Terminal.app," no interception.

**`terminal:run`** (Ana's autonomous-command path — the only filtered path): checks `isDangerousCommand` against a regex blocklist — `rm -rf`/`-fr` (any flag order), `sudo`, `mkfs`, `dd if=`, writes to raw disk devices, `chmod -R 777 /`, `git push --force`, `git reset --hard`, `git clean -f*`, `shutdown|reboot|killall`, curl/wget piped to a shell, fork-bomb pattern. Comment: "not a security boundary… just a guard on the one path that runs a command autonomously from a voice request."

**`killAllTerminals()`** (called from `before-quit`) kills every session.

Default cwd ties into `repoPaths.ts`'s `getCurrentRepoRoot()`, giving a consistent default across Build/Run/Terminal without them coordinating directly.

---

## 24. Desktop — packaging & build config

**`electron-builder.yml`**: `appId: com.ana.desktop`, `productName: Ana`. `asarUnpack: ['**/node_modules/node-pty/**']` (native binary must stay unpacked for dlopen/LoadLibrary). macOS target `dmg`, category developer-tools. Windows target `nsis` (not one-click, per-machine off, install dir changeable). Registers the `ana://` protocol.

`postinstall: electron-rebuild -f -w node-pty` rebuilds the native module against Electron's ABI.

**`vite.config.ts`** — three build targets from one config:
- **Renderer**: root `src/renderer`, `envDir` at the app root (so `.env` flags like `VITE_TAVUS_MANUAL_START` live alongside the app, not buried in source), output `dist/`.
- **Main**: entry `src/main/index.ts` → `dist-electron/main`; `external: ['electron','simple-git','node-pty']` (native/dynamic-require deps must load from `node_modules`, not bundle).
- **Preload**: entry `src/preload/index.ts` → `dist-electron/preload`; reloads the renderer on preload rebuild; `external: ['electron']`.

---

## 25. Renderer — App.tsx layout

Two `react-resizable-panels` `Group`s render unconditionally in **both** full and popup window modes; presentation differences are driven purely by imperative `panelRef.collapse()/expand()/resize()` calls so the live Daily/Tavus call inside `AnaConversation` **never unmounts**.

```
<Group orientation="vertical" id="ana-rows">
  <Panel id="main" minSize="30%">
    <Group orientation="horizontal" id="ana-cols">
      <Panel id="sidebar" collapsible collapsedSize={0} defaultSize="22%" minSize="14%" maxSize="32%">
      <Separator/>
      <Panel id="ana" defaultSize="32%" minSize="18%">
      <Separator/>
      <Panel id="workspace" collapsible collapsedSize={0} minSize="25%">
    </Group>
  </Panel>
  <Separator/>  (hidden unless terminalOpen && !popup)
  <Panel id="terminal" collapsible collapsedSize={0} defaultSize={0} maxSize="60%">
</Group>
```

- Both group layouts persist to `localStorage` via `useDefaultLayout`, but saves are **skipped while in popup mode** so imperative popup resizing never clobbers the saved full-window layout.
- `resizeTargetMinimumSize={{coarse:24, fine:8}}` — larger invisible hit target than the 1px visible hairline.
- **Sidebar**: `sidebarOpen` store bool drives expand/collapse; also force-collapsed in popup mode. Dragging to ~0px flips `sidebarOpen` back in the store (full mode only).
- **Terminal**: `terminalOpen` drives expand/collapse; first-ever open explicitly resizes to `240px` (no remembered size yet). Drag-to-close mirrors back into `terminalOpen`.
- **Popup mode**: expanded → workspace panel expands, Ana panel resizes to a fixed `280px` companion strip. Collapsed → workspace collapses (Ana pane fills the floating window). Leaving popup restores the **last full-window column layout** (saved on every full-mode layout change).
- Error banner receives focus whenever the active error (conversation or repo store) changes.
- `CommandPalette` always mounted, self-gates on its own open state.
- Cleanup: `beforeunload` clears the Build undo stack; fresh-launch mount resets conversation context; auth status checked on mount.

**Voice-event handling** — one `onPanelUpdate` subscription switches on event type:
- `build-request` → sets Build mode, resolves `repoPath` if needed, appends the user turn (voice history lives in Tavus, not the renderer), runs the build turn. Narrates one line per patch, speaks a randomized "done" line (4 variants).
- `undo-request` / `redo-request` → calls the store action, speaks the result if non-null.
- `create-project-request` → full pipeline: scaffold → speak + "pick a folder" → parent-dir picker (handles cancel) → subscribes to progress (speaks a line per stage: writing/committing/creating-repo/pushing) → create → on success, adds the repo to the store, selects it, resolves the local path, switches to Build mode, speaks success/warning, kicks off background index+sync, then auto-launches it.
- `run-request` → resolves `repoPath`, `stop` kills it, `launch` subscribes to progress (speaks "Installing…"/"Starting it up…") then launches, speaking a result-shaped line.
- `terminal-request` → runs the command via the terminal store, speaks any error.
- Any other event (a `PanelEvent`) → sets active mode, applies the panel, clears loading; if the window is a collapsed popup, expands it so a voice-pushed diagram/board is actually visible.

**Keyboard**: `` Cmd/Ctrl+` `` toggles the terminal.

---

## 26. Renderer — components

- **TopBar.tsx** — Full-window header, `h-12`, drag region with no-drag opt-outs on every control. Left: sidebar toggle, brand mark, selected-repo chip. Center: 3-slot segmented mode switcher with a sliding highlight (`translateX`, 200ms ease-out). Right: terminal toggle, pop-out-to-popup button, command-palette trigger (shows `⌘K`), connection-status dot + login. macOS gets left padding for traffic lights; Windows/Linux gets right padding for overlay controls.
- **PopupHeader.tsx** — Slim `h-8` header. Brand mark, compact mode tabs (only when expanded), expand/collapse toggle, "return to full" button.
- **ConnectPanel.tsx** — GitHub connect button (silently swallows cancel/closed/abort errors) → repo dropdown → Index/Re-index button. Selecting a repo resets conversation context before fetching the tree.
- **FileTree.tsx** — Builds a nested tree client-side from the flat GitHub tree (folders-first alphabetical). Colored badge/icon per file type (TS/JS/JSON/MD/CSS/HTML/Python/YAML/shell get distinct colors; `.env*`/`.lock`/images get lucide icons; everything else a generic file icon). Build-mode clicks open the file; the open file gets a left accent bar.
- **FileTreeSection.tsx** — Collapsible wrapper; auto-expands in Build mode, auto-collapses elsewhere, but a manual toggle persists until the next mode change.
- **AnaConversation.tsx** — `VITE_TAVUS_MANUAL_START` env flag (default true unless explicitly `'false'`) gates manual "Start Ana" vs auto-boot once connected. Three states: idle CTA, connecting (pulsing dual-ring orb), active (`CviConversation`, 250ms cross-fade in).
- **CviConversation.tsx** — Wraps Daily's React provider. Sub-parts: `CallJoiner` (joins if not auto-joined), `VoiceEchoBridge` (binds the call object for text-side "speak this" triggers), `ReplicaTranscriptBridge` (listens for Tavus app-messages, tolerant JSON parsing, filters to `role==='replica'`, pushes utterances into the store for diagram highlighting), `CallStage` (full-bleed remote video, local PiP, click-to-expand when popup collapsed), `CallControls` (mute/camera/leave, `stopPropagation` so clicks don't also trigger popup-expand; leave ends the Daily call + backend conversation).
- **CommandPalette.tsx** — Cmd/Ctrl+K toggle, Escape closes. Type-to-filter over the 3 mode commands, arrow-key nav, Enter selects. Backdrop-blurred overlay, scale-in animation.
- **Composer.tsx** — Typed-input alternative to voice, toggled from `RefreshContext`'s keyboard icon. Enter sends. Build mode: appends turn, runs the build turn, narrates each patch with a 700ms stagger while opening each file. Other modes: calls the turn endpoint directly, toggles panel-loading, updates mode unless locked.
- **IndexingProgress.tsx** — Top strip inside the workspace panel; 1px filled bar with a live status line; fades in via `requestAnimationFrame`, unmounts on transition-end (or immediately under reduced motion, since transitionend never fires).
- **RefreshContext.tsx** — Strip atop the Ana pane (hidden in popup). "Refresh context" re-syncs the repo without restarting the Tavus call, shows a 2-second confirmation. Also hosts the composer-visibility toggle.
- **WorkspaceContent.tsx** — Cross-fades on mode change (150ms out → swap → 150ms in), then moves focus to the panel's heading. Skips animation under reduced motion. Shows the skeleton only for Plan-mode loading (Build/Understand manage their own).
- **PanelSkeleton.tsx** — Shimmer-block loading placeholder shaped to roughly match diagram/whiteboard content, avoiding layout shift.
- **FadeIn.tsx** — Generic opacity 0→1 mount fade (200ms).

---

## 27. Renderer — UI primitives (`components/ui/`)

- **Button** — variants `primary`/`secondary` (default)/`ghost`/`danger`; sizes `sm`/`md`; `loading` swaps in a spinner.
- **IconButton** — requires `aria-label`; `active` toggles an accent-tinted state.
- **PanelHeader** — bordered header bar with a focus-targetable `<h2 tabIndex={-1}>` title, optional icon/subtitle/actions.
- **EmptyState** — centered icon-in-box + title + description + optional action.
- **ErrorBanner** — `role="alert"`, focus-targetable, optional dismiss.
- **Kbd** — bordered monospace key-cap chip.
- **Spinner** — spinning lucide icon.
- **GithubIcon** — hand-written SVG (lucide-react dropped brand icons).
- Icon convention (documented in the barrel export): lucide-react, size 16 in headers/buttons, size 14 in dense rows, `strokeWidth={1.75}` everywhere, `aria-hidden` unless icon-only.

---

## 28. Renderer — panels

### Understand — `DiagramPanel.tsx` (~1200 lines, the most complex file in the renderer)
Mermaid configured with ELK layout (`@mermaid-js/layout-elk`), `NETWORK_SIMPLEX` node placement, `mergeEdges:true`, step-curve edges (later rounded in post-processing). Custom theme variables matching the app's dark palette.

**6 semantic node types**, each with fill/border/accent colors and a 24×24 icon: `entrypoint`, `service`, `datastore`, `external`, `module`, `decision`, plus a default fallback.

**Post-processing** (the bulk of the file): strips Mermaid's opaque background; injects glow filter defs; tags nodes with `data-node-id`; sets per-type fill/stroke; rounds corners; adds a corner icon badge; reroutes edges through a pure M/L-path corner-rounding function (bails on curves/arcs); recolors edges and edge-label pill chips; tints subgraph "cluster" cards from a 4-entry palette so adjacent architectural layers read as distinct bands; applies consistent node-label typography.

**Edge-type inference**: reads dagre classes when present, else parses ELK's ID pattern disambiguated against known node IDs.

**Three views**: `overview` | `focus` (dims everything outside the subject + its direct neighbors to 12% opacity, then zoom-fits) | `detail` (dedicated deep-dive map, no dimming). Breadcrumb navigation back to overview.

**Speech-synced highlighting**: two drivers — real Daily transcript events (once matched, takes over permanently for that diagram) and a fallback scheduler that parses node mentions out of the spoken text, dwelling on each match proportional to sentence length, or cycling uniformly through backend-provided highlighted nodes if no sentence maps.

**Zoom/pan** via `react-zoom-pan-pinch` — zoom in/out buttons, fit-to-panel, copy-diagram-source (2s confirmation), a diagram-history switcher once more than one diagram has been seen this session.

### Plan — `WhiteboardPanel.tsx`
Collapsible accordion cards per user story (id badge, "As X, I want Y so that Z"). Expanded content: bulleted acceptance criteria, implementation tasks with **disabled** (read-only) checkboxes.

### Build — `BuildPanel.tsx` / `CodeEditor.tsx` / `ChangedFilesList.tsx` / `UndoBar.tsx`
Files load from GitHub (no local folder needed to browse); a local folder is only required to actually apply changes (inline prompt). Auto-opens a sensible default file on entry (README, then common entry-point names, else first file).

`CodeEditor` uses Monaco: diff view (side-by-side, always read-only, `ana-dark` theme) when the open file matches a recent patch; otherwise an editable dirty-tracked editor. Save via `Cmd/Ctrl+S` (both a global listener and a Monaco-native command binding) or the toolbar button.

`ChangedFilesList` — horizontal chip strip of recently-patched files, hidden when empty.

`UndoBar` — always-visible footer, status dot + last-change summary, disabled when nothing to undo.

### Terminal — `TerminalPanel.tsx`
xterm.js instance created **once** on mount (cheap, spawns no process). A `ResizeObserver` fits and forwards new dimensions. The underlying PTY is spawned **lazily** on first open, via the shared terminal store (so a voice-triggered command reuses the same session). Instance/process persists across the panel being hidden (collapsed, not unmounted) — scrollback and running processes survive.

---

## 29. Renderer — Zustand stores

- **`uiStore`** — `activeMode`, `modeLocked` (false = mode follows Ana's own classification), `sidebarOpen`, `commandPaletteOpen`, `isPanelLoading`, `windowMode`/`popupExpanded` (mirror of main-process presentation, only updated from pushes), `composerOpen`, `terminalOpen`. `setMode` locks; `setActiveMode` doesn't (voice-driven).
- **`repoStore`** — `connected`, `login`, `repos`, `selectedRepo`, `tree`, `repoId`, `indexStatus`/`indexMessage`/`indexProcessed`/`indexTotal`, `error`. Switching repos resets all index-related state.
- **`conversationStore`** — `conversationUrl`/`conversationId`, `history`, `processing`/`sessionStarting`, `lastSpoken`, `diagram`/`overviewDiagram` (remembered master map for the breadcrumb, since `diagram` gets replaced by detail drill-ins)/`diagramView`/`focusSubject`, `diagramHistory` (every distinct diagram seen this session)/`activeHistoryId`, `whiteboard`, `error`, `liveUtterance` (monotonic sequence number so repeated identical text still re-triggers consumers). `applyResult` (text-turn path, appends history) vs `applyPanel` (voice-turn path, no history append since Tavus owns voice history). Module export `recentHistory()` caps at the last 6 turns sent to the backend.
- **`buildStore`** — `sessionId` (stable UUID for the undo history), `repoPath`/`pathChecked`/`selectingPath`, `localTree`, `openPath`/`openContents`/`isDirty`/`loadingFile`, `lastPatches`, `busy`/`lastSummary`/`canUndo`, `gitStatus`, `error`.
- **`terminalStore`** — `sessionId`, `error`; module-scoped (not store state) in-flight-creation promise dedupes concurrent session-creation races. `runCommand` opens the panel, waits 50ms for the listener to attach, ensures a session, then runs.

---

## 30. Renderer — design token system

Single dark palette (no light theme, no theme switch anywhere in the renderer). Source of truth: `theme/tokens.json`, consumed by both Tailwind (via `require`) and `theme/tokens.ts` (via `import`) so Tailwind, Monaco, and xterm all derive from the same values.

```
surface: base #0D0D0F, raised #131316, overlay #1A1A1F, modal #202027,
         border #2A2A32, borderStrong #3A3A45, hover #1E1E24, active #26262E
text:    primary #EDEDF0, secondary #A2A2AC, tertiary #6E6E78, disabled #4A4A52
accent:  primary #3B82F6, hover #2563EB, muted rgba(59,130,246,.14),
         border rgba(59,130,246,.40), glow rgba(59,130,246,.15)
status:  success #34D399, warning #FBBF24, danger #F87171 (+ muted variants)
```

`tokens.ts` also exports `defineAnaMonacoTheme(monaco)` (registers the `ana-dark` Monaco theme from the same values — hex8, since Monaco rejects `rgba()`) and `xtermTheme` (background/foreground/cursor/selection from the same tokens).

A **separate diagram-domain palette** exists in `tailwind.config.cjs`, intentionally not tied to `tokens.json`: `node.file/service/database/external/entry` and `edge.default/active/label` — though `DiagramPanel.tsx`'s actual SVG post-processing uses its own local hex constants rather than these Tailwind classes directly (only the toolbar/breadcrumb text references the Tailwind `node-*`/`edge-*` classes).

Custom font-size scale (smaller than Tailwind defaults): `xs 11px, sm 12px, base 13px, lg 14px, xl 16px`. Fonts: Inter Variable (sans), Fira Code (mono), self-hosted via `@fontsource-variable/inter`/`@fontsource/fira-code`.

---

## 31. Renderer — lib utilities

- **`ipc.ts`** — `isIpcError<T>()` type guard narrowing the `IpcResult<T>` union used everywhere `window.ana.*` is awaited.
- **`monaco.ts`** — Configures Monaco to load from the locally bundled package (required under the strict CSP, no CDN). Registers Vite-bundled workers per language (json/css/html/typescript/default). `languageForPath(path)` extension→Monaco-language map (ts/tsx/js/jsx→typescript/javascript, json, css/scss/less, html, md→markdown, py→python, go, rs→rust, java, yml/yaml, sh→shell, default→plaintext).
- **`voiceEcho.ts`** — Lets non-voice code make Ana speak after the fact, via a Tavus "echo" app-message over the Daily data channel. `bindVoice`/`speakViaTavus` (best-effort no-op until bound, never throws).

---

## 32. Renderer — keyboard shortcuts, animation, accessibility

**Shortcuts**: `Cmd/Ctrl+K` (Command Palette, `Escape` closes, arrows navigate), `` Cmd/Ctrl+` `` (terminal toggle), `Cmd/Ctrl+S` (save in Build editor — bound both globally and Monaco-natively), `Enter` (send in Composer / select in palette), `Cmd/Ctrl+Shift+A` (pop out / return to full window — accelerator lives in the main process).

**Animation**: sliding mode-switch pill (200ms), panel cross-fade (150ms×2), diagram swap fade (150ms) and focus-dim fade (220ms), zoom/pan transforms (150–300ms), `FadeIn` mount fade (200ms), command-palette scale-in (140ms), `ana-pulse` connecting-orb loop (1.5s), `ana-shimmer` skeleton sweep (1.6s), progress-bar width transition (300ms).

**Reduced motion**: a global CSS media query disables every transition/animation. Components also branch explicitly in JS where a CSS-only disable isn't enough — `IndexingProgress` unmounts immediately rather than waiting for `transitionend` (which never fires with transitions off), `WorkspaceContent` skips fade sequencing and swaps+focuses synchronously, `DiagramPanel` skips its swap-delay timer.

**Accessibility**: `aria-live="polite"` on indexing progress, refresh confirmation, undo-bar summary. Focus management moves to the panel heading after a mode swap settles, and to the error banner whenever a new error appears. `role="tablist"`/`aria-selected`/`aria-controls` on both mode switchers. `aria-pressed` on toggles. `aria-busy` on the Ana pane, workspace main, composer send, connect/index buttons. `aria-label` required on every icon-only button (enforced by `IconButton`'s prop type). Branded `::selection` tint, app-wide `:focus-visible` ring replacing default outlines. Thin themed scrollbars applied globally.

---

## 33. Cross-cutting design patterns

- **Prompt caching**: every Anthropic call uses one static system-prompt string with `cache_control:{type:'ephemeral'}`; dynamic content always goes in the user message, never interpolated into the cached system block.
- **Never-throw services**: `turn.ts`, `diagramView.ts`, `diagramCache.ts`, `architectureSummary.ts`, `moduleMap.ts`, `projectMap.ts`, history consumers, and the indexer's sub-steps all degrade gracefully (log + fallback) rather than propagate — a voice turn always produces *some* spoken output.
- **Determinism for diagrams**: every call feeding a persisted/cached artifact uses `temperature:0`, so a cache-miss regeneration reproduces the same output given the same inputs.
- **Two-call pattern**: cheap/fast classification (Haiku) always precedes reasoning (Sonnet) — "Call 1 / Call 2" terminology used throughout.
- **Full-file patches, edit-based generation**: `FilePatch.original`/`updated` are always full file contents (so undo/redo/rollback are trivial swaps), even though the model only ever emits small search/replace edits that get assembled into full-file patches server-side.
- **Imperative panel control over conditional rendering**: the entire resizable-panel layout renders unconditionally in both window modes; presentation differences are driven by imperative collapse/expand/resize calls specifically so the live Tavus call never unmounts.
- **Backend owns undo state, desktop owns disk state**: the undo/redo stack is entirely backend-side in-memory; the desktop's only role is applying whatever patches the backend hands back to the local filesystem and rolling back the backend's operation if the local write itself fails.

---

## 34. Known inconsistencies

- `git:stage` is registered as an IPC handler but not exposed in preload — the renderer can't call it directly; only the internal `stagePaths()` export is used.
- `ana.git.status()` in the renderer maps to IPC channel `'git:getStatus'`, not `'git:status'` — method name and channel name diverge (breaks the `domain:action` convention documented elsewhere, though internally consistent between the two files that use it).
- The "max 5 files per Build operation" rule is entirely backend-side — the desktop app has no client-side awareness or enforcement of it.
- Two separate diagram color systems exist: the Tailwind `node-*`/`edge-*` tokens and `DiagramPanel.tsx`'s own local hex constants used in actual SVG rendering — only chrome text (toolbar/breadcrumb) uses the Tailwind classes.
- No idle-session timeout exists on Tavus conversations (see the cost analysis produced earlier in this project's history for the financial implication).
- `JWT_SECRET` defaults to an insecure literal string if unset, and no route actually verifies the JWT it issues — GitHub-backed routes authenticate purely via the raw `x-github-token` header.
