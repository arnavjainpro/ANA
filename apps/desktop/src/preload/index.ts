import { contextBridge, ipcRenderer } from 'electron';
import type {
  AnaApi,
  BuildTurnRequest,
  BusEvent,
  IndexProgress,
  TurnRequest,
} from '../types.js';

// Expose ONLY named functions — never ipcRenderer itself.
const api: AnaApi = {
  auth: {
    connectGitHub: () => ipcRenderer.invoke('auth:connectGitHub'),
    status: () => ipcRenderer.invoke('auth:status'),
  },
  repo: {
    list: () => ipcRenderer.invoke('repo:list'),
    tree: (fullName: string, branch: string) =>
      ipcRenderer.invoke('repo:tree', fullName, branch),
    index: (fullName: string) => ipcRenderer.invoke('repo:index', fullName),
    onIndexProgress: (cb: (p: IndexProgress) => void) => {
      const listener = (_e: unknown, p: IndexProgress): void => cb(p);
      ipcRenderer.on('repo:index-progress', listener);
      return () => ipcRenderer.removeListener('repo:index-progress', listener);
    },
  },
  conversation: {
    start: () => ipcRenderer.invoke('conversation:start'),
    end: (conversationId: string) => ipcRenderer.invoke('conversation:end', conversationId),
    turn: (req: TurnRequest) => ipcRenderer.invoke('conversation:turn', req),
    syncRepo: (args: { repoId: string; repoFullName?: string }) =>
      ipcRenderer.invoke('conversation:syncRepo', args),
    resetContext: () => ipcRenderer.invoke('conversation:resetContext'),
    onPanelUpdate: (cb: (evt: BusEvent) => void) => {
      const listener = (_e: unknown, evt: BusEvent): void => cb(evt);
      ipcRenderer.on('conversation:panel', listener);
      return () => ipcRenderer.removeListener('conversation:panel', listener);
    },
  },
  build: {
    selectRepoPath: (repoFullName: string) =>
      ipcRenderer.invoke('build:selectRepoPath', repoFullName),
    getRepoPath: (repoFullName: string) => ipcRenderer.invoke('build:getRepoPath', repoFullName),
    turn: (req: BuildTurnRequest) => ipcRenderer.invoke('build:turn', req),
    undo: (sessionId: string, repoPath: string) =>
      ipcRenderer.invoke('build:undo', sessionId, repoPath),
    endSession: (sessionId: string) => ipcRenderer.invoke('build:endSession', sessionId),
  },
  fs: {
    readFile: (repoPath: string, relPath: string) =>
      ipcRenderer.invoke('fs:readFile', repoPath, relPath),
    listDir: (repoPath: string) => ipcRenderer.invoke('fs:listDir', repoPath),
    getRepoRoot: () => ipcRenderer.invoke('fs:getRepoRoot'),
  },
  git: {
    status: (repoPath: string) => ipcRenderer.invoke('git:getStatus', repoPath),
  },
};

contextBridge.exposeInMainWorld('ana', api);
