import { create } from 'zustand';
import type { Mode } from '../../types';

export interface OpenFile {
  path: string;
  name: string;
}

interface UiState {
  activeMode: Mode;
  /** When false the mode follows Ana's intent classification automatically. */
  modeLocked: boolean;
  setMode: (mode: Mode) => void;
  toggleModeLock: () => void;
  
  // Sidebar and panel management
  sidebarOpen: boolean;
  sidebarWidth: number; // in pixels, default 280
  showAnaFace: boolean;
  commandPaletteOpen: boolean;
  
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setShowAnaFace: (show: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;

  /**
   * True while a Claude reasoning turn is in flight (Phases 4–5). Drives the
   * right-panel skeleton + `aria-busy`. Set on turn start, cleared on payload.
   */
  isPanelLoading: boolean;
  setPanelLoading: (loading: boolean) => void;
  
  // File viewer state
  openFiles: OpenFile[];
  activeFileIndex: number | null;
  fileViewerWidth: number; // in pixels, default 320
  
  openFile: (path: string, name: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (index: number) => void;
  setFileViewerWidth: (width: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeMode: 'Understand',
  modeLocked: false,
  setMode: (mode) => set({ activeMode: mode, modeLocked: true }),
  toggleModeLock: () => set((s) => ({ modeLocked: !s.modeLocked })),
  
  sidebarOpen: true,
  sidebarWidth: 280,
  showAnaFace: true,
  commandPaletteOpen: false,
  
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(600, width)) }),
  setShowAnaFace: (show) => set({ showAnaFace: show }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  isPanelLoading: false,
  setPanelLoading: (isPanelLoading) => set({ isPanelLoading }),
  
  // File viewer
  openFiles: [],
  activeFileIndex: null,
  fileViewerWidth: 320,
  
  openFile: (path, name) =>
    set((state) => {
      const existingIndex = state.openFiles.findIndex((f) => f.path === path);
      if (existingIndex >= 0) {
        // File already open, just switch to it
        return { activeFileIndex: existingIndex };
      }
      // Add new file
      return {
        openFiles: [...state.openFiles, { path, name }],
        activeFileIndex: state.openFiles.length,
      };
    }),
    
  closeFile: (path) =>
    set((state) => {
      const newOpenFiles = state.openFiles.filter((f) => f.path !== path);
      let newActiveIndex = state.activeFileIndex;
      
      if (state.activeFileIndex !== null) {
        if (state.openFiles[state.activeFileIndex]?.path === path) {
          // Closing the active file
          newActiveIndex = newOpenFiles.length > 0 ? Math.min(state.activeFileIndex, newOpenFiles.length - 1) : null;
        } else if (state.activeFileIndex! > state.openFiles.findIndex((f) => f.path === path)) {
          newActiveIndex = newActiveIndex! - 1;
        }
      }
      
      return {
        openFiles: newOpenFiles,
        activeFileIndex: newActiveIndex,
      };
    }),
    
  setActiveFile: (index) => set({ activeFileIndex: index }),
  setFileViewerWidth: (width) => set({ fileViewerWidth: Math.max(200, Math.min(800, width)) }),
}));
