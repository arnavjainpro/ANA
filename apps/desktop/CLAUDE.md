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
    App.tsx         Resizable panel layout (react-resizable-panels): sidebar /
                    Ana face / workspace columns + bottom terminal row + top bar.
    store/          Zustand, one domain per file: uiStore, repoStore,
                    conversationStore, buildStore, terminalStore.
    components/     TopBar, PopupHeader, ConnectPanel, FileTree(Section),
                    AnaConversation/CviConversation, CommandPalette, Composer
                    (typed input below the Ana face, toggled from the Ana pane).
    components/ui/  Shared primitives: Button, IconButton, PanelHeader,
                    EmptyState, ErrorBanner, Kbd, Spinner, GithubIcon. Icons
                    come from lucide-react (size 16/14, strokeWidth 1.75).
    theme/          tokens.json (single source for Tailwind + Monaco + xterm)
                    and tokens.ts (typed export + ana-dark Monaco theme).
    panels/
      understand/   Mermaid diagram panel.
      plan/         Whiteboard (stories / criteria / tasks) panel.
      build/        Monaco editor + diff + changed files + undo bar.
      terminal/     xterm.js PTY terminal (bottom panel).
    lib/            Renderer-side utilities (e.g. ana API wrapper, mermaid render).
  types.ts          Shared types + the AnaApi IPC contract (source of truth for
                    preload ↔ renderer). Duplicated from backend so the renderer
                    bundle has no backend dependency.
```

## Rules specific to the desktop app

- Build mode never commits (`ipc/git.ts` only stages). The ONE exception is
  project creation (`ipc/project.ts`): a brand-new project gets `git init` + an
  initial commit + a push to the freshly created GitHub repo, using a one-shot
  authenticated URL that is never written to `.git/config`.

- The renderer accesses everything through `window.ana` (typed `AnaApi`). It must never
  import from `apps/backend` or call external APIs directly.
- IPC channel names are colon-namespaced (`domain:action`) and must match across
  `main/ipc/*`, `preload/index.ts`, and `types.ts`.
- `repo:index` streams: the backend returns NDJSON (`{type:'progress'|'done'|'error'}`);
  `ipc/repo.ts` parses it and emits `repo:index-progress` events to the renderer, then
  resolves with the final `done` payload (or `{ error }`).
- The Ana face embeds the Tavus `conversationUrl` (a Daily.co room). The CSP in
  `index.html` already allows `frame-src https://*.daily.co https://*.tavus.io`.
- Tailwind theme colors are semantic tokens sourced from
  `src/renderer/theme/tokens.json`: `surface-{base,raised,overlay,modal,border,
  border-strong,hover,active}`, `text-{primary,secondary,tertiary,disabled}`,
  `accent-{primary,hover,muted,border}`, `status-{success,warning,danger}(-muted)`.
  Monaco (`ana-dark`) and xterm themes derive from the same file via
  `theme/tokens.ts`. No inline styles.
- Config files that must be CommonJS use `.cjs` (`tailwind.config.cjs`,
  `postcss.config.cjs`). Everything else is `.ts`/`.tsx`, strict mode.
