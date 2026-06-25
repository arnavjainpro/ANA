import { create } from 'zustand';
import type { ConversationTurn, FilePatch, GitStatus, RepoTreeNode } from '../../types';
import { isIpcError } from '../lib/ipc';

/** A change to the currently-open file, used to drive Monaco diff decorations. */
interface OpenFileDecoration {
  original: string;
  updated: string;
  /** Increments each time a patch updates the open file so the editor re-decorates. */
  nonce: number;
}

interface BuildState {
  /** Stable id for this Build session's undo history. */
  sessionId: string;
  /** Absolute local working-copy path, or null until chosen. */
  repoPath: string | null;
  /** True once we've checked for a stored path (so we know to prompt). */
  pathChecked: boolean;
  selectingPath: boolean;

  /** The local working copy as a flat tree (mirrors what's actually on disk). */
  localTree: RepoTreeNode[];
  openPath: string | null;
  openContents: string;
  loadingFile: boolean;
  decoration: OpenFileDecoration | null;

  busy: boolean;
  lastSummary: string | null;
  canUndo: boolean;
  gitStatus: GitStatus | null;
  error: string | null;

  /** Resolve a stored repo path (call on Build entry). */
  ensureRepoPath: (repoFullName: string) => Promise<void>;
  /** Prompt for a folder and persist it. */
  selectRepoPath: (repoFullName: string) => Promise<void>;
  /** Reload the local working-copy file tree from disk. */
  loadLocalTree: () => Promise<void>;
  /** Open a file in the editor (reads from disk via IPC). */
  openFile: (relPath: string) => Promise<void>;
  /** Run a Build turn; returns Ana's spoken reply (or null on hard error). */
  runTurn: (input: {
    transcript: string;
    history: ConversationTurn[];
    repoId?: string;
    repoFullName?: string;
  }) => Promise<string | null>;
  /** Undo the last operation; returns Ana's spoken reply. */
  undo: () => Promise<string | null>;
  refreshGitStatus: () => Promise<void>;
  setError: (error: string | null) => void;
  endSession: () => void;
}

function applyPatchToOpenFile(
  state: BuildState,
  patches: FilePatch[],
): Partial<BuildState> {
  if (!state.openPath) return {};
  const match = patches.find((p) => p.path === state.openPath);
  if (!match) return {};
  return {
    openContents: match.updated,
    decoration: {
      original: match.original,
      updated: match.updated,
      nonce: (state.decoration?.nonce ?? 0) + 1,
    },
  };
}

export const useBuildStore = create<BuildState>((set, get) => ({
  sessionId: crypto.randomUUID(),
  repoPath: null,
  pathChecked: false,
  selectingPath: false,

  localTree: [],
  openPath: null,
  openContents: '',
  loadingFile: false,
  decoration: null,

  busy: false,
  lastSummary: null,
  canUndo: false,
  gitStatus: null,
  error: null,

  ensureRepoPath: async (repoFullName) => {
    const { repoPath } = await window.ana.build.getRepoPath(repoFullName);
    set({ repoPath, pathChecked: true });
    if (repoPath) {
      void get().refreshGitStatus();
      void get().loadLocalTree();
    }
  },

  selectRepoPath: async (repoFullName) => {
    set({ selectingPath: true, error: null });
    const result = await window.ana.build.selectRepoPath(repoFullName);
    set({ selectingPath: false });
    if (isIpcError(result)) {
      // A cancelled dialog is not an error.
      if (result.error !== 'cancelled') set({ error: result.error });
      return;
    }
    set({ repoPath: result.repoPath, pathChecked: true });
    void get().refreshGitStatus();
    void get().loadLocalTree();
  },

  loadLocalTree: async () => {
    const { repoPath } = get();
    if (!repoPath) return;
    const result = await window.ana.fs.listDir(repoPath);
    if (!isIpcError(result)) set({ localTree: result.tree });
  },

  openFile: async (relPath) => {
    const { repoPath } = get();
    if (!repoPath) return;
    set({ loadingFile: true, error: null });
    const result = await window.ana.fs.readFile(repoPath, relPath);
    set({ loadingFile: false });
    if (isIpcError(result)) {
      set({ error: result.error });
      return;
    }
    set({ openPath: relPath, openContents: result.contents, decoration: null });
  },

  runTurn: async ({ transcript, history, repoId, repoFullName }) => {
    const { repoPath, sessionId } = get();
    if (!repoPath) {
      set({ error: 'Choose your local project folder first.' });
      return null;
    }
    set({ busy: true, error: null });
    const result = await window.ana.build.turn({
      sessionId,
      repoPath,
      transcript,
      history,
      repoId,
      repoFullName,
    });
    set({ busy: false });
    if (isIpcError(result)) {
      set({ error: result.error });
      return result.error;
    }
    if (result.patches.length > 0) {
      set((state) => ({
        ...applyPatchToOpenFile(state, result.patches),
        lastSummary: summaryFor(result.patches),
        canUndo: true,
      }));
      void get().refreshGitStatus();
      void get().loadLocalTree();
      // If the change touched a file that isn't open, open the first patched one.
      const { openPath } = get();
      const firstPatched = result.patches[0];
      if (firstPatched && (!openPath || !result.patches.some((p) => p.path === openPath))) {
        await get().openFile(firstPatched.path);
      }
    }
    return result.spoken;
  },

  undo: async () => {
    const { repoPath, sessionId } = get();
    if (!repoPath) return null;
    set({ busy: true, error: null });
    const result = await window.ana.build.undo(sessionId, repoPath);
    set({ busy: false });
    if (isIpcError(result)) {
      set({ error: result.error });
      return result.error;
    }
    if (result.patches.length > 0) {
      set((state) => ({
        ...applyPatchToOpenFile(state, result.patches),
        canUndo: false,
        lastSummary: null,
      }));
      void get().refreshGitStatus();
      void get().loadLocalTree();
    }
    return result.spoken;
  },

  refreshGitStatus: async () => {
    const { repoPath } = get();
    if (!repoPath) return;
    const result = await window.ana.git.status(repoPath);
    if (!isIpcError(result)) set({ gitStatus: result });
  },

  setError: (error) => set({ error }),

  endSession: () => {
    const { sessionId } = get();
    void window.ana.build.endSession(sessionId);
  },
}));

function summaryFor(patches: FilePatch[]): string {
  const first = patches[0];
  if (!first) return '';
  return patches.length === 1 ? first.summary : `${first.summary} (${patches.length} files)`;
}
