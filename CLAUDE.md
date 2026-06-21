# Ana — Engineering Guide (CLAUDE.md)

Ana is a **voice-first AI coding partner for non-technical people**. A user connects a
GitHub repo, talks to a photorealistic face (Tavus CVI) in real time, and Ana explains,
plans, and builds alongside them while a dynamic right-hand panel shifts with the
conversation mode. See `README.md` for the full product/architecture spec — it is
authoritative.

## Current scope

This build implements **Understand mode** and **Plan mode** only. Build, Debug, and
Review modes do **not** exist yet — do not scaffold, stub, or create placeholder files
for them.

## Monorepo layout (npm workspaces)

```
apps/
  backend/   Fastify API server. Holds ALL secrets. Talks to GitHub, OpenAI,
             Anthropic, Tavus, and Supabase/pgvector.
  desktop/   Electron app. main (Node) + preload (contextBridge) + renderer (React).
```

Run everything from the repo root: `npm install` then `npm run dev` (starts backend +
desktop concurrently). `npm run typecheck` typechecks both workspaces.

## The turn pipeline (the heart of the app)

Each user utterance is processed by `apps/backend/src/services/turn.ts`:

1. **Call 1 — intent (Haiku, `claude-haiku-4-5`)**: classify mode + extract target.
2. **Context assembly**: RAG retrieval (top-5 chunks via pgvector cosine search), plus
   the named file's full contents if the user referenced one.
3. **Call 2 — reasoning (Sonnet, `claude-sonnet-4-6`)**: returns structured JSON —
   `{ spoken, panel, payload }`. Understand → `payload.mermaid`; Plan →
   `payload.{stories,criteria,tasks}`.
4. Ana speaks `spoken` via Tavus; the right panel renders `payload`.

Target end-to-end latency: **<1000ms**. The two Claude calls must stay under ~750ms
combined. System prompts are **static** strings with Anthropic prompt caching enabled —
never interpolate inside the cached block.

## Hard rules

- **Secrets live in the backend only.** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  `TAVUS_*`, `SUPABASE_*` must never reach the renderer bundle or cross IPC. The
  renderer never calls Anthropic/Tavus/OpenAI directly — always via the backend.
- **GitHub token** is stored via `electron.safeStorage` only, never plaintext on disk.
- **IPC never throws.** Every `ipcMain.handle` returns the payload or `{ error: string }`.
- **Backend routes never throw across HTTP.** They return `{ error, code }` + a status
  via `sendError`. Route handlers contain no business logic — they call a service.
- **contextBridge exposes named functions only** — never `ipcRenderer` itself.
- **Cross-platform**: use `path.join`/`path.sep`, never hardcoded `/`. Use
  `app.getPath('temp')` for temp files. Tested on Windows + macOS.

## Code style

- TypeScript everywhere, strict mode. No `.js` source (config files may be `.cjs`).
- No `any`. If a type is unknown, model it and add `// TODO: tighten this type`.
- Zustand stores split by domain: `conversation`, `repo`, `ui`. One file each.
- Tailwind utility classes only — no inline styles in React.
- Per-file indexing failures are logged and skipped, never abort the job.
- If a Claude call fails/times out, Ana returns the spoken fallback
  ("I ran into an issue — can you try again?"), never a silent failure.

## Git discipline

- Commit per phase: `feat(phase-N): <what was completed>`.
- Never commit `.env`. `.env.example` (keys only, no values) lives at the repo root.

## Status / known history

The backend is complete for Understand + Plan. The desktop main/preload/renderer
TypeScript source was rebuilt from the compiled `dist-electron` output after an earlier
loss; the IPC contract is defined in `apps/desktop/src/types.ts` and is the source of
truth for the preload surface.
