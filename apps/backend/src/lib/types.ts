// Shared domain types for the Ana backend.

export type Mode = 'Understand' | 'Plan' | 'Build' | 'Debug' | 'Review';

/** Modes implemented in this build session. */
export const SUPPORTED_MODES: readonly Mode[] = ['Understand', 'Plan'] as const;

/** Result of the Call 1 intent classification (Haiku). */
export interface IntentClassification {
  mode: Mode;
  intent: string;
  target: string | null;
  /** True when the user is asking to undo/revert the last change. */
  undo?: boolean;
}

/** A single turn of conversation, oldest first. */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Mermaid diagram payload for Understand mode. */
export interface DiagramPayload {
  mermaid: string;
}

/** A user story in a Plan whiteboard. */
export interface PlanStory {
  id: string;
  as: string;
  want: string;
  so: string;
}

/** Acceptance criteria grouped by story. */
export interface PlanCriteria {
  storyId: string;
  items: string[];
}

/** A concrete task mapped to a story. */
export interface PlanTask {
  id: string;
  title: string;
  detail: string;
  storyId: string;
}

/** Whiteboard payload for Plan mode. */
export interface WhiteboardPayload {
  stories: PlanStory[];
  criteria: PlanCriteria[];
  tasks: PlanTask[];
}

export type PanelType = 'diagram' | 'whiteboard';

// --- Build mode ---------------------------------------------------------------

/**
 * A single file change. `original` and `updated` are FULL file contents (never a
 * diff) so rollback is a trivial swap and patch-apply can never fail mid-hunk.
 */
export interface FilePatch {
  /** Relative path from the repo root, e.g. "src/api/index.ts". */
  path: string;
  /** Full original file contents, byte-for-byte as Ana was given them. */
  original: string;
  /** Full updated file contents with Ana's change applied. */
  updated: string;
  /** One sentence describing what changed in this file. */
  summary: string;
}

/** The structured Call 2 (Sonnet) response in Build mode. */
export interface BuildResponse {
  spoken: string;
  patches: FilePatch[];
}

/** Build turn result returned to the client (adds the undo operation id). */
export interface BuildResult extends BuildResponse {
  /** UUID for this operation; '' when no patches were applied. */
  operationId: string;
}

/** Reversed-patch payload returned by the undo endpoint. */
export interface UndoResult {
  spoken: string;
  patches: FilePatch[];
}

/** Inbound request for a Build-mode turn. */
export interface BuildTurnRequest {
  sessionId: string;
  /** Absolute local path to the user's working copy (used by the client). */
  repoPath: string;
  /** Latest user utterance (Tavus STT transcript). */
  transcript: string;
  history: ConversationTurn[];
  /** Indexed repo id, used for RAG retrieval. */
  repoId?: string;
  /** Owner/name of the connected repo, used to fetch target file contents. */
  repoFullName?: string;
  /**
   * Full contents of the target files, read from the user's local working copy
   * by the client (phase 2). When present these are the ground truth Ana edits,
   * so each patch's `original` matches disk exactly. Absent for legacy callers,
   * which fall back to fetching contents from GitHub.
   */
  files?: { path: string; contents: string }[];
}

/** Phase-1 Build result: the target paths the client should read from disk. */
export interface BuildPlan {
  paths: string[];
}

/** A single recorded Build operation on the per-session undo stack. */
export interface BuildOperation {
  operationId: string;
  timestamp: number;
  patches: FilePatch[];
  summary: string;
}

/** Result of validating a batch of patches before they touch disk. */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/** The structured Call 2 (Sonnet) response. */
export interface AnaResponse {
  spoken: string;
  panel: PanelType;
  payload: DiagramPayload | WhiteboardPayload;
}

/** Inbound request to process a single conversation turn. */
export interface TurnRequest {
  repoId: string;
  utterance: string;
  history: ConversationTurn[];
  /** Optional file the user referenced; contents are injected into Call 2. */
  filePath?: string;
  /** Manual mode override from the UI; intent classification still runs. */
  forcedMode?: Mode;
}

/** A retrieved RAG chunk with its source path. */
export interface RetrievedChunk {
  filePath: string;
  content: string;
  similarity: number;
}

/** A node in a GitHub repository file tree. */
export interface RepoTreeNode {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
}

/** Standard error body returned by every backend route on failure. */
export interface ApiError {
  error: string;
  code: string;
}
