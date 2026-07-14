// Shared domain types for the Ana backend.

export type Mode = 'Understand' | 'Plan' | 'Build' | 'Debug' | 'Review';

/** Modes implemented in this build session. */
export const SUPPORTED_MODES: readonly Mode[] = ['Understand', 'Plan'] as const;

/** What kind of diagram view the user's utterance is asking for. */
export type DiagramScope = 'overview' | 'focus' | 'detail';

/** How much detail a diagram should carry. The overview defaults to 'basic'
 *  (a simple high-level map); 'deep' is only used when the user explicitly asks
 *  for an in-depth version of the whole architecture. */
export type DiagramDepth = 'basic' | 'deep';

/** Result of the Call 1 intent classification (Haiku). */
export interface IntentClassification {
  mode: Mode;
  intent: string;
  target: string | null;
  /** True when the user is asking to undo/revert the last change. */
  undo?: boolean;
  /** True when the user is asking to redo/re-apply the change they just undid. */
  redo?: boolean;
  /**
   * True when the utterance calls for a NEW or changed diagram view. Follow-ups
   * that just continue the conversation ("tell me more", "why") are false, so
   * the current diagram holds still instead of being redrawn every turn.
   */
  wantsDiagram?: boolean;
  /**
   * Which view to show when wantsDiagram is true:
   * - 'overview' — the whole-project map
   * - 'focus'    — isolate one component + its direct connections (a filter of
   *                the overview, same layout)
   * - 'detail'   — a deep-dive map of one component's internals
   * Null when no diagram is being requested.
   */
  diagramScope?: DiagramScope | null;
  /** The component/file/API the focus or detail view is about; null otherwise. */
  diagramSubject?: string | null;
  /**
   * How detailed an OVERVIEW the user wants. 'basic' (default) is a simple
   * high-level map; 'deep' is the detailed whole-project map, used only when the
   * user explicitly asks for an in-depth/full version of the overall architecture.
   * Ignored for focus/detail scopes (a part is always shown in depth).
   */
  diagramDepth?: DiagramDepth;
  /**
   * True when the user asks to start a brand-NEW project/app/site ("start a new
   * project called X", or "build me a calculator" with nothing connected) —
   * as opposed to editing existing code.
   */
  createProject?: boolean;
  /** The name the user gave the new project, else null. */
  projectName?: string | null;
  /** "run it / show me / open it" → 'launch'; "stop it / kill it" → 'stop'. */
  runAction?: 'launch' | 'stop' | null;
  /**
   * The literal shell command to run when the user explicitly asks Ana to run
   * a terminal/shell command (install deps, run tests, check git status, run a
   * script) — distinct from `runAction`, which only launches/stops the dev
   * server. Null when no shell command was requested.
   */
  terminalCommand?: string | null;
}

// --- Project creation (Ana scaffolds + publishes a brand-new repo) -------------

/** One complete new file in a project scaffold (never a diff). */
export interface ScaffoldFile {
  path: string;
  contents: string;
  summary: string;
}

/** The structured scaffold response for a new project. */
export interface ScaffoldResult {
  /** kebab-case, GitHub-safe project name. */
  projectName: string;
  /** One-line description used for the GitHub repo. */
  description: string;
  /** Ana's spoken summary of what she built. */
  spoken: string;
  files: ScaffoldFile[];
}

/** A repository freshly created on GitHub via the API. */
export interface CreatedRepo {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
  size: number;
  owner: string;
  htmlUrl: string;
}

/** A single turn of conversation, oldest first. */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Mermaid diagram payload for Understand mode. */
export interface DiagramPayload {
  mermaid: string;
  /** Ordered node IDs to highlight sequentially as Ana speaks about them. */
  highlightedNodes?: string[];
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

/**
 * One search/replace edit. `oldString` is an exact, unique snippet of the
 * current file; `newString` replaces it. An empty `oldString` means "create this
 * file" with `newString` as the full contents.
 */
export interface FileEdit {
  oldString: string;
  newString: string;
}

/** All edits the model wants to make to one file. */
export interface FileEditGroup {
  path: string;
  summary: string;
  edits: FileEdit[];
}

/** The raw Build response from the model: spoken reply + per-file edits. */
export interface BuildEditResponse {
  spoken: string;
  files: FileEditGroup[];
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

// --- Module map (structured whole-repo analysis, built at index time) ---------

/** One collapsed module (a directory subtree) in the repo's module map. */
export interface ModuleInfo {
  /** Stable snake_case id derived from the path, e.g. apps_backend_src_services. */
  id: string;
  /** Directory path from the repo root; '' for the repo root itself. */
  path: string;
  fileCount: number;
  isEntrypoint: boolean;
  /** One-sentence role summary (filled by Haiku at index time; may be absent). */
  summary?: string;
  /** Up to ~8 representative files inside the module. */
  keyFiles: string[];
}

/** A module-level import/dependency edge, aggregated from file imports. */
export interface ModuleEdge {
  from: string;
  to: string;
  count: number;
}

/**
 * The structured whole-repo analysis generated at index time: modules with
 * summaries, import edges between them, and entry points. Persisted on the
 * repos row (module_map jsonb) and fed to diagram generation so the canonical
 * overview reflects the entire codebase, not a handful of RAG chunks.
 */
export interface ModuleMap {
  version: 1;
  generatedAt: string;
  modules: ModuleInfo[];
  edges: ModuleEdge[];
  /** Entry-point file paths (package.json main/bin, index/main files, …). */
  entryPoints: string[];
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
