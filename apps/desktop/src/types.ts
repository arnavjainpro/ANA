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
  };
  conversation: {
    start: () => Promise<IpcResult<{ conversationId: string; conversationUrl: string }>>;
    turn: (req: TurnRequest) => Promise<IpcResult<TurnResult>>;
    /**
     * Re-announce the active repo to the backend so the next voice (Tavus) turn
     * has RAG context for it. Used by the "Refresh context" button after indexing.
     */
    syncRepo: (args: { repoId: string; repoFullName?: string }) => Promise<IpcResult<{ ok: true }>>;
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
    /** Clear the session's undo history. */
    endSession: (sessionId: string) => Promise<{ ok: true }>;
  };
  fs: {
    readFile: (repoPath: string, relPath: string) => Promise<IpcResult<{ contents: string }>>;
    getRepoRoot: () => Promise<{ repoPath: string | null }>;
  };
  git: {
    status: (repoPath: string) => Promise<IpcResult<GitStatus>>;
  };
}

declare global {
  interface Window {
    ana: AnaApi;
  }
}
