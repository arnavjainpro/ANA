import { create } from 'zustand';
import type { RepoSummary, RepoTreeNode } from '../../types';

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
  error: string | null;

  setConnected: (connected: boolean, login: string | null) => void;
  setRepos: (repos: RepoSummary[]) => void;
  selectRepo: (repo: RepoSummary) => void;
  setTree: (tree: RepoTreeNode[]) => void;
  setIndexStatus: (status: IndexStatus, message?: string) => void;
  setRepoId: (id: string) => void;
  setError: (error: string | null) => void;
}

export const useRepoStore = create<RepoState>((set) => ({
  connected: false,
  login: null,
  repos: [],
  selectedRepo: null,
  tree: [],
  repoId: null,
  indexStatus: 'idle',
  indexMessage: '',
  error: null,

  setConnected: (connected, login) => set({ connected, login }),
  setRepos: (repos) => set({ repos }),
  selectRepo: (repo) =>
    set({ selectedRepo: repo, tree: [], repoId: null, indexStatus: 'idle', indexMessage: '' }),
  setTree: (tree) => set({ tree }),
  setIndexStatus: (indexStatus, indexMessage = '') => set({ indexStatus, indexMessage }),
  setRepoId: (repoId) => set({ repoId }),
  setError: (error) => set({ error }),
}));
