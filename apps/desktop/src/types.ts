// Shared types across the Electron main, preload, and renderer processes.
// These mirror the backend domain types but are intentionally duplicated so the
// renderer bundle has no backend dependency.

export type Mode = 'Understand' | 'Plan' | 'Build';

export interface RepoSummary {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
  size: number;
}

export interface RepoTreeNode {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface DiagramPayload {
  mermaid: string;
  /** Ordered node IDs to highlight sequentially as Ana speaks about them. */
  highlightedNodes?: string[];
}

export interface PlanStory {
  id: string;
  as: string;
  want: string;
  so: string;
}

export interface PlanCriteria {
  storyId: string;
  items: string[];
}

export interface PlanTask {
  id: string;
  title: string;
  detail: string;
  storyId: string;
}

export interface WhiteboardPayload {
  stories: PlanStory[];
  criteria: PlanCriteria[];
  tasks: PlanTask[];
}

export interface TurnResult {
  mode: Mode;
  spoken: string;
  panel: 'diagram' | 'whiteboard';
  payload: DiagramPayload | WhiteboardPayload;
}

/** Which diagram view a panel payload represents. */
export type DiagramScope = 'overview' | 'focus' | 'detail';

/** One entry in the session's diagram history — used by the toolbar switcher. */
export interface DiagramEntry {
  /** Stable dedup key: focusSubject ?? 'overview'. */
  id: string;
  /** Display label: component name, or 'Full Architecture' for the overview. */
  label: string;
  payload: DiagramPayload;
  view: DiagramScope;
  focusSubject: string | null;
}

/** A diagram/board pushed from a voice turn. */
export interface PanelEvent extends TurnResult {
  type: 'panel';
  /** For diagram panels: the view this payload represents. 'focus' reuses the
   *  overview payload and is filtered/zoomed to `focusSubject` in the renderer;
   *  'detail' carries a dedicated deep-dive map. Absent for whiteboards. */
  view?: DiagramScope;
  /** The component the focus/detail view is about; null/absent for overview. */
  focusSubject?: string | null;
}

/** A spoken change request from a voice turn, applied via the Build pipeline. */
export interface BuildRequestEvent {
  type: 'build-request';
  transcript: string;
  /** Prior conversation (from Tavus) so Build has the planning context. */
  history: ConversationTurn[];
}

/** A spoken request to undo the last change applied this session. */
export interface UndoRequestEvent {
  type: 'undo-request';
}

/** A spoken request to redo the most recently undone change. */
export interface RedoRequestEvent {
  type: 'redo-request';
}

/** A spoken request to create a brand-new project (scaffold → GitHub → launch). */
export interface CreateProjectRequestEvent {
  type: 'create-project-request';
  transcript: string;
  history: ConversationTurn[];
}

/** A spoken request to launch or stop the current project. */
export interface RunRequestEvent {
  type: 'run-request';
  action: 'launch' | 'stop';
}

/** Events streamed to the desktop from voice (Tavus) turns. */
export type BusEvent =
  | PanelEvent
  | BuildRequestEvent
  | UndoRequestEvent
  | RedoRequestEvent
  | CreateProjectRequestEvent
  | RunRequestEvent;

// --- New-project creation ------------------------------------------------------

/** One complete new file in a project scaffold (never a diff). */
export interface ScaffoldFile {
  path: string;
  contents: string;
  summary: string;
}

/** The backend's structured scaffold for a new project. */
export interface ScaffoldResult {
  projectName: string;
  description: string;
  spoken: string;
  files: ScaffoldFile[];
}

/** Result of creating a new project (files + git + GitHub repo). */
export interface ProjectCreateResult {
  repoPath: string;
  repo: RepoSummary;
  owner: string;
  htmlUrl: string;
  /** Set when the project exists locally but the GitHub push failed. */
  warning?: string;
}

/** Progress pushed while project:create runs, so Ana can narrate. */
export interface ProjectProgress {
  stage: 'writing' | 'committing' | 'creating-repo' | 'pushing';
  detail?: string;
}

// --- Launching the user's project ----------------------------------------------

/** Progress pushed while run:launch works, so Ana can narrate slow steps. */
export interface RunProgress {
  stage: 'installing' | 'starting' | 'ready' | 'exited';
  detail?: string;
}

export interface RunStatus {
  running: boolean;
  url: string | null;
  kind: 'dev-server' | 'static' | null;
}

// --- Build mode --------------------------------------------------------------

/** A full-file change. `original`/`updated` are complete contents, never diffs. */
export interface FilePatch {
  path: string;
  original: string;
  updated: string;
  summary: string;
}

/** Result of a Build-mode turn returned to the renderer (post disk-apply). */
export interface BuildResult {
  spoken: string;
  patches: FilePatch[];
  operationId: string;
}

/** Result of an undo: the reversed patches that were applied to disk. */
export interface UndoResult {
  spoken: string;
  patches: FilePatch[];
}

/** Build-mode turn request from the renderer. */
export interface BuildTurnRequest {
  sessionId: string;
  repoPath: string;
  transcript: string;
  history: ConversationTurn[];
  repoId?: string;
  repoFullName?: string;
}

/** Working-tree status used to mark modified files in the Build file tree. */
export interface GitStatus {
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface TurnRequest {
  repoId: string;
  repoFullName?: string;
  utterance: string;
  history: ConversationTurn[];
  filePath?: string;
  forcedMode?: Mode;
}

export interface IndexProgress {
  processed: number;
  total: number;
  currentFile: string;
}

export interface IndexDone {
  repoId: string;
  filesIndexed: number;
  chunksStored: number;
  filesSkipped: number;
}

/** Every IPC result is either the payload or an `{ error }` — never a throw. */
export type IpcResult<T> = T | { error: string };

// --- Window presentation ------------------------------------------------------

/**
 * Which presentation the single app window is in. 'full' is the split layout;
 * 'popup' is the small always-on-top floating bubble (Ana's face only, with the
 * workspace opening as an expanding flyout). The main process owns this state —
 * the renderer only mirrors `window:mode-changed` pushes.
 */
export type WindowMode = 'full' | 'popup';

export interface WindowModeState {
  mode: WindowMode;
  /** In popup mode: whether the workspace flyout is open. Always false in full. */
  popupExpanded: boolean;
}

/** The API surface exposed to the renderer via contextBridge. */
export interface AnaApi {
  auth: {
    connectGitHub: () => Promise<IpcResult<{ login: string }>>;
    status: () => Promise<{ connected: boolean; login: string | null }>;
  };
  repo: {
    list: () => Promise<IpcResult<{ repos: RepoSummary[] }>>;
    tree: (fullName: string, branch: string) => Promise<IpcResult<{ tree: RepoTreeNode[] }>>;
    index: (fullName: string) => Promise<IpcResult<IndexDone>>;
    onIndexProgress: (cb: (p: IndexProgress) => void) => () => void;
    fileContent: (fullName: string, path: string) => Promise<IpcResult<{ content: string }>>;
  };
  conversation: {
    start: () => Promise<IpcResult<{ conversationId: string; conversationUrl: string }>>;
    /** End a Tavus conversation so it stops consuming a concurrency slot. */
    end: (conversationId: string) => Promise<IpcResult<{ ok: true }>>;
    turn: (req: TurnRequest) => Promise<IpcResult<TurnResult>>;
    /**
     * Re-announce the active repo to the backend so the next voice (Tavus) turn
     * has RAG context for it. Used by the "Refresh context" button after indexing.
     */
    syncRepo: (args: { repoId: string; repoFullName?: string }) => Promise<IpcResult<{ ok: true }>>;
    /** Forget the backend's active repo (fresh launch / repo switch). */
    resetContext: () => Promise<IpcResult<{ ok: true }>>;
    /**
     * Subscribe to events pushed from voice (Tavus) turns (panel updates or
     * Build requests), which bypass the renderer. Returns an unsubscribe function.
     */
    onPanelUpdate: (cb: (evt: BusEvent) => void) => () => void;
  };
  build: {
    /** Open a folder picker, validate against the repo, persist, and return the path. */
    selectRepoPath: (repoFullName: string) => Promise<IpcResult<{ repoPath: string }>>;
    /** The persisted local path for a repo, or null if none chosen yet. */
    getRepoPath: (repoFullName: string) => Promise<{ repoPath: string | null }>;
    /** Run a Build turn and apply the resulting patches to disk. */
    turn: (req: BuildTurnRequest) => Promise<IpcResult<BuildResult>>;
    /** Undo the last operation, applying the reversed patches to disk. */
    undo: (sessionId: string, repoPath: string) => Promise<IpcResult<UndoResult>>;
    /** Redo the most recently undone operation, re-applying its patches to disk. */
    redo: (sessionId: string, repoPath: string) => Promise<IpcResult<UndoResult>>;
    /** Clear the session's undo history. */
    endSession: (sessionId: string) => Promise<{ ok: true }>;
  };
  fs: {
    readFile: (repoPath: string, relPath: string) => Promise<IpcResult<{ contents: string }>>;
    writeFile: (repoPath: string, relPath: string, contents: string) => Promise<IpcResult<{ success: true }>>;
    /** Recursively list the local working copy as a flat RepoTreeNode[]. */
    listDir: (repoPath: string) => Promise<IpcResult<{ tree: RepoTreeNode[] }>>;
    getRepoRoot: () => Promise<{ repoPath: string | null }>;
  };
  git: {
    status: (repoPath: string) => Promise<IpcResult<GitStatus>>;
  };
  project: {
    /** Generate a new-project scaffold from a spoken request (backend Claude call). */
    scaffold: (transcript: string, history: ConversationTurn[]) => Promise<IpcResult<ScaffoldResult>>;
    /** Folder picker for WHERE to put the new project (parent directory). */
    selectParentDir: (projectName: string) => Promise<IpcResult<{ parentDir: string }>>;
    /** Create the project: write files, git init+commit, GitHub repo, push. */
    create: (args: {
      scaffold: ScaffoldResult;
      parentDir: string;
      login: string | null;
    }) => Promise<IpcResult<ProjectCreateResult>>;
    /** Subscribe to create-progress pushes. Returns an unsubscribe function. */
    onProgress: (cb: (p: ProjectProgress) => void) => () => void;
  };
  run: {
    /** Launch the project (dev server or static page) and open it on screen. */
    launch: (
      repoPath: string,
    ) => Promise<IpcResult<{ url: string | null; kind: 'dev-server' | 'static' }>>;
    /** Stop the project's dev server (or all running ones when omitted). */
    stop: (repoPath?: string) => Promise<IpcResult<{ ok: true }>>;
    status: (repoPath: string) => Promise<RunStatus>;
    /** Subscribe to launch-progress pushes. Returns an unsubscribe function. */
    onProgress: (cb: (p: RunProgress) => void) => () => void;
  };
  window: {
    /** Switch the app window between the full split layout and the floating popup. */
    setMode: (mode: WindowMode) => Promise<IpcResult<WindowModeState>>;
    getMode: () => Promise<WindowModeState>;
    /** Open/close the workspace flyout while in popup mode. */
    setPopupExpanded: (expanded: boolean) => Promise<IpcResult<WindowModeState>>;
    /** Subscribe to mode changes (pop-out button, global shortcut). Returns unsubscribe. */
    onModeChanged: (cb: (state: WindowModeState) => void) => () => void;
  };
}

declare global {
  interface Window {
    ana: AnaApi;
  }
}
