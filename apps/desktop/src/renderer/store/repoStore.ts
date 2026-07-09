import { create } from 'zustand';
import type { RepoSummary, RepoTreeNode } from '../../types';
import { isIpcError } from '../lib/ipc';

type IndexStatus = 'idle' | 'indexing' | 'ready' | 'error';

interface RepoState {
  connected: boolean;
  login: string | null;
  repos: RepoSummary[];
  selectedRepo: RepoSummary | null;
  tree: RepoTreeNode[];
  repoId: string | null;
  indexStatus: IndexStatus;
  indexMessage: string;
  /** Files processed / total, used to drive the progress bar width. */
  indexProcessed: number;
  indexTotal: number;
  error: string | null;

  viewingFile: { path: string; content: string } | null;
  viewingFileLoading: boolean;

  setConnected: (connected: boolean, login: string | null) => void;
  setRepos: (repos: RepoSummary[]) => void;
  selectRepo: (repo: RepoSummary) => void;
  setTree: (tree: RepoTreeNode[]) => void;
  setIndexStatus: (status: IndexStatus, message?: string) => void;
  setIndexProgress: (processed: number, total: number) => void;
  setRepoId: (id: string) => void;
  setError: (error: string | null) => void;
  openRepoFile: (path: string) => Promise<void>;
  closeRepoFile: () => void;
}

export const useRepoStore = create<RepoState>((set, get) => ({
  connected: false,
  login: null,
  repos: [],
  selectedRepo: null,
  tree: [],
  repoId: null,
  indexStatus: 'idle',
  indexMessage: '',
  indexProcessed: 0,
  indexTotal: 0,
  error: null,
  viewingFile: null,
  viewingFileLoading: false,

  setConnected: (connected, login) => set({ connected, login }),
  setRepos: (repos) => set({ repos }),
  selectRepo: (repo) =>
    set({
      selectedRepo: repo,
      tree: [],
      repoId: null,
      indexStatus: 'idle',
      indexMessage: '',
      indexProcessed: 0,
      indexTotal: 0,
      viewingFile: null,
    }),
  setTree: (tree) => set({ tree }),
  setIndexStatus: (indexStatus, indexMessage = '') => set({ indexStatus, indexMessage }),
  setIndexProgress: (indexProcessed, indexTotal) => set({ indexProcessed, indexTotal }),
  setRepoId: (repoId) => set({ repoId }),
  setError: (error) => set({ error }),

  openRepoFile: async (path) => {
    const { selectedRepo } = get();
    if (!selectedRepo) return;
    set({ viewingFileLoading: true, viewingFile: null });
    const result = await window.ana.repo.fileContent(selectedRepo.full_name, path);
    set({ viewingFileLoading: false });
    if (!isIpcError(result)) set({ viewingFile: { path, content: result.content } });
  },

  closeRepoFile: () => set({ viewingFile: null, viewingFileLoading: false }),
}));
