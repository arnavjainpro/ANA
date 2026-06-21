// Shared types across the Electron main, preload, and renderer processes.
// These mirror the backend domain types but are intentionally duplicated so the
// renderer bundle has no backend dependency.

export type Mode = 'Understand' | 'Plan';

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
  };
}

declare global {
  interface Window {
    ana: AnaApi;
  }
}
