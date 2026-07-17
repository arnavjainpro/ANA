import { create } from 'zustand';
import type { ConversationTurn, FilePatch, GitStatus, RepoTreeNode } from '../../types';
import { isIpcError } from '../lib/ipc';
import { pushToast } from './toastStore';

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
  isDirty: boolean;
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
  /** Open a file from GitHub in the editor. */
  openGitHubFile: (fullName: string, path: string) => Promise<void>;
  /** Open a file from local disk in the editor (used internally after build turns). */
  openFile: (relPath: string) => Promise<void>;
  /** Called when the user edits the file in the Monaco editor. */
  setOpenContents: (contents: string) => void;
  /** Save the currently-open file to the local working copy. */
  saveFile: () => Promise<void>;
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
  isDirty: false,
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

  openGitHubFile: async (fullName, path) => {
    set({ loadingFile: true, error: null, isDirty: false });
    const result = await window.ana.repo.fileContent(fullName, path);
    set({ loadingFile: false });
    if (isIpcError(result)) {
      set({ error: result.error });
      return;
    }
    set({ openPath: path, openContents: result.content, isDirty: false });
  },

  openFile: async (relPath) => {
    const { repoPath } = get();
    if (!repoPath) return;
    set({ loadingFile: true, error: null, isDirty: false });
    const result = await window.ana.fs.readFile(repoPath, relPath);
    set({ loadingFile: false });
    if (isIpcError(result)) {
      set({ error: result.error });
      return;
    }
    set({ openPath: relPath, openContents: result.contents, isDirty: false });
  },

  setOpenContents: (contents) => set({ openContents: contents, isDirty: true }),

  saveFile: async () => {
    const { repoPath, openPath, openContents } = get();
    if (!openPath) return;
    if (!repoPath) {
      set({ error: 'Select your local project folder first to save changes.' });
      return;
    }
    set({ error: null });
    const result = await window.ana.fs.writeFile(repoPath, openPath, openContents);
    if (isIpcError(result)) {
      set({ error: result.error });
      return;
    }
    set({ isDirty: false });
  },

  runTurn: async ({ transcript, history, repoId, repoFullName }) => {
    const { repoPath, sessionId } = get();
    if (!repoPath) {
      set({ error: 'Select your local project folder first so Ana can apply changes.' });
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
      const firstPatched = result.patches[0];
      const { openPath } = get();
      // If the open file was patched, sync its content; otherwise jump to the first patched file.
      const patchedOpenFile = result.patches.find((p) => p.path === openPath);
      set((state) => ({
        ...applyPatchToOpenFile(state, result.patches),
        lastPatches: result.patches,
        lastSummary: summaryFor(result.patches),
        canUndo: true,
        // Jump to first patched file if the currently-open file wasn't touched.
        ...(firstPatched && !patchedOpenFile
          ? { openPath: firstPatched.path, openContents: firstPatched.updated }
          : {}),
      }));
      void get().refreshGitStatus();
      void get().loadLocalTree();
      const n = result.patches.length;
      pushToast(`Applied ${n} change${n === 1 ? '' : 's'}`, 'success');
    } else {
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
      pushToast('Reverted last change', 'info');
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
      pushToast('Reapplied change', 'info');
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
