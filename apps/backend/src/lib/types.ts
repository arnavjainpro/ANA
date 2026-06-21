// Shared domain types for the Ana backend.

export type Mode = 'Understand' | 'Plan' | 'Build' | 'Debug' | 'Review';

/** Modes implemented in this build session. */
export const SUPPORTED_MODES: readonly Mode[] = ['Understand', 'Plan'] as const;

/** Result of the Call 1 intent classification (Haiku). */
export interface IntentClassification {
  mode: Mode;
  intent: string;
  target: string | null;
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
