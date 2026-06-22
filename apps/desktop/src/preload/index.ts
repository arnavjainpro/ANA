import { contextBridge, ipcRenderer } from 'electron';
import type {
  AnaApi,
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
    file: (fullName: string, filePath: string) =>
      ipcRenderer.invoke('repo:file', fullName, filePath),
    index: (fullName: string) => ipcRenderer.invoke('repo:index', fullName),
    onIndexProgress: (cb: (p: IndexProgress) => void) => {
      const listener = (_e: unknown, p: IndexProgress): void => cb(p);
      ipcRenderer.on('repo:index-progress', listener);
      return () => ipcRenderer.removeListener('repo:index-progress', listener);
    },
  },
  conversation: {
    start: () => ipcRenderer.invoke('conversation:start'),
    turn: (req: TurnRequest) => ipcRenderer.invoke('conversation:turn', req),
  },
};

contextBridge.exposeInMainWorld('ana', api);
