import { create } from 'zustand';
import type { ConversationTurn, FilePatch, GitStatus, RepoTreeNode } from '../../types';
import { isIpcError } from '../lib/ipc';

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
  /** Files changed by Ana's last turn (drives the diff view + changed-files list). */
  lastPatches: FilePatch[];

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
  /**
   * Run a Build turn. Returns Ana's spoken reply plus the applied patches (so
   * the caller can narrate one line per file), or null when there is no repo
   * path yet.
   */
  runTurn: (input: {
    transcript: string;
    history: ConversationTurn[];
    repoId?: string;
    repoFullName?: string;
  }) => Promise<{ spoken: string; patches: FilePatch[] } | null>;
  /** Undo the last operation; returns Ana's spoken reply. */
  undo: () => Promise<string | null>;
  /** Redo the most recently undone operation; returns Ana's spoken reply. */
  redo: () => Promise<string | null>;
  refreshGitStatus: () => Promise<void>;
  setError: (error: string | null) => void;
  endSession: () => void;
}

/** If the currently-open file is among the patches, sync its editor contents. */
function applyPatchToOpenFile(
  state: BuildState,
  patches: FilePatch[],
): Partial<BuildState> {
  if (!state.openPath) return {};
  const match = patches.find((p) => p.path === state.openPath);
  return match ? { openContents: match.updated } : {};
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
  lastPatches: [],

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
    set({ openPath: relPath, openContents: result.contents });
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
      return { spoken: result.error, patches: [] };
    }
    if (result.patches.length > 0) {
      set((state) => ({
        ...applyPatchToOpenFile(state, result.patches),
        lastPatches: result.patches,
        lastSummary: summaryFor(result.patches),
        canUndo: true,
      }));
      void get().refreshGitStatus();
      void get().loadLocalTree();
      // If the change touched a file that isn't open, open the first patched one.
      // Open the first changed file so its diff shows immediately; the Composer
      // then narrates each file in turn, advancing the view.
      const { openPath } = get();
      const firstPatched = result.patches[0];
      if (firstPatched && (!openPath || !result.patches.some((p) => p.path === openPath))) {
        await get().openFile(firstPatched.path);
      }
    } else {
      // No changes this turn — clear any lingering diff from a previous turn.
      set({ lastPatches: [] });
    }
    return { spoken: result.spoken, patches: result.patches };
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
        lastPatches: [],
        canUndo: false,
        lastSummary: null,
      }));
      void get().refreshGitStatus();
      void get().loadLocalTree();
    }
    return result.spoken;
  },

  redo: async () => {
    const { repoPath, sessionId } = get();
    if (!repoPath) return null;
    set({ busy: true, error: null });
    const result = await window.ana.build.redo(sessionId, repoPath);
    set({ busy: false });
    if (isIpcError(result)) {
      set({ error: result.error });
      return result.error;
    }
    if (result.patches.length > 0) {
      set((state) => ({
        ...applyPatchToOpenFile(state, result.patches),
        lastPatches: result.patches,
        canUndo: true,
        lastSummary: summaryFor(result.patches),
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
