# Ana Desktop (CLAUDE.md)

Electron app: **main** (Node), **preload** (contextBridge), **renderer** (React + Vite +
Tailwind + Zustand). Built by `vite-plugin-electron` into `dist-electron/{main,preload}`
and `dist/` (renderer). Dev: `npm run dev` (Vite). Package: `npm run package` (mac dmg /
win nsis via electron-builder).

## Layout

```
src/
  main/
    index.ts        Entry: single-instance lock, ana:// deep-link (open-url +
                    second-instance), BrowserWindow, registers all IPC.
    ipc/            One file per domain. Each handler returns payload | { error }.
      auth.ts       auth:connectGitHub, auth:status.
      repo.ts       repo:list, repo:tree, repo:index (consumes backend NDJSON,
                    forwards progress via repo:index-progress events).
      conversation.ts  conversation:start, conversation:turn.
    github/oauth.ts Deep-link OAuth flow; resolves the ana://auth?code callback.
    lib/
      backend.ts    Thin HTTP client to the backend (adds x-github-token).
      tokenStore.ts safeStorage-encrypted GitHub token; never plaintext on disk.
  preload/
    index.ts        contextBridge.exposeInMainWorld('ana', ...) — named functions
                    only, never raw ipcRenderer. Surface defined by AnaApi in types.ts.
  renderer/
    main.tsx        React root.
    App.tsx         Split layout (left: Ana face, right: workspace) + top bar.
    store/          Zustand, one domain per file: uiStore, repoStore, conversationStore.
    components/     TopBar, ConnectGitHub, RepoList, FileTree, AnaFace.
    panels/
      understand/   Mermaid diagram panel.
      plan/         Whiteboard (stories / criteria / tasks) panel.
    lib/            Renderer-side utilities (e.g. ana API wrapper, mermaid render).
  types.ts          Shared types + the AnaApi IPC contract (source of truth for
                    preload ↔ renderer). Duplicated from backend so the renderer
                    bundle has no backend dependency.
```

## Rules specific to the desktop app

- The renderer accesses everything through `window.ana` (typed `AnaApi`). It must never
  import from `apps/backend` or call external APIs directly.
- IPC channel names are colon-namespaced (`domain:action`) and must match across
  `main/ipc/*`, `preload/index.ts`, and `types.ts`.
- `repo:index` streams: the backend returns NDJSON (`{type:'progress'|'done'|'error'}`);
  `ipc/repo.ts` parses it and emits `repo:index-progress` events to the renderer, then
  resolves with the final `done` payload (or `{ error }`).
- The Ana face embeds the Tavus `conversationUrl` (a Daily.co room). The CSP in
  `index.html` already allows `frame-src https://*.daily.co https://*.tavus.io`.
- Tailwind theme colors: `ana-bg`, `ana-panel`, `ana-border`, `ana-accent`
  (see `tailwind.config.cjs`). No inline styles.
- Config files that must be CommonJS use `.cjs` (`tailwind.config.cjs`,
  `postcss.config.cjs`). Everything else is `.ts`/`.tsx`, strict mode.
