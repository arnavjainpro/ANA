import { contextBridge, ipcRenderer } from 'electron';
import type {
  AnaApi,
  BuildTurnRequest,
  BusEvent,
  ConversationTurn,
  IndexProgress,
  ProjectProgress,
  RunProgress,
  ScaffoldResult,
  TurnRequest,
  WindowMode,
  WindowModeState,
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
    fileContent: (fullName: string, path: string) =>
      ipcRenderer.invoke('repo:fileContent', fullName, path),
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
    redo: (sessionId: string, repoPath: string) =>
      ipcRenderer.invoke('build:redo', sessionId, repoPath),
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
  project: {
    scaffold: (transcript: string, history: ConversationTurn[]) =>
      ipcRenderer.invoke('project:scaffold', transcript, history),
    selectParentDir: (projectName: string) =>
      ipcRenderer.invoke('project:selectParentDir', projectName),
    create: (args: { scaffold: ScaffoldResult; parentDir: string; login: string | null }) =>
      ipcRenderer.invoke('project:create', args),
    onProgress: (cb: (p: ProjectProgress) => void) => {
      const listener = (_e: unknown, p: ProjectProgress): void => cb(p);
      ipcRenderer.on('project:progress', listener);
      return () => ipcRenderer.removeListener('project:progress', listener);
    },
  },
  run: {
    launch: (repoPath: string) => ipcRenderer.invoke('run:launch', repoPath),
    stop: (repoPath?: string) => ipcRenderer.invoke('run:stop', repoPath),
    status: (repoPath: string) => ipcRenderer.invoke('run:status', repoPath),
    onProgress: (cb: (p: RunProgress) => void) => {
      const listener = (_e: unknown, p: RunProgress): void => cb(p);
      ipcRenderer.on('run:progress', listener);
      return () => ipcRenderer.removeListener('run:progress', listener);
    },
  },
  window: {
    setMode: (mode: WindowMode) => ipcRenderer.invoke('window:setMode', mode),
    getMode: () => ipcRenderer.invoke('window:getMode'),
    setPopupExpanded: (expanded: boolean) =>
      ipcRenderer.invoke('window:setPopupExpanded', expanded),
    onModeChanged: (cb: (state: WindowModeState) => void) => {
      const listener = (_e: unknown, state: WindowModeState): void => cb(state);
      ipcRenderer.on('window:mode-changed', listener);
      return () => ipcRenderer.removeListener('window:mode-changed', listener);
    },
  },
};

contextBridge.exposeInMainWorld('ana', api);
