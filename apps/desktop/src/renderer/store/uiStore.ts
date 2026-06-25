import { create } from 'zustand';
import type { Mode } from '../../types';

interface UiState {
  activeMode: Mode;
  /** When false the mode follows Ana's intent classification automatically. */
  modeLocked: boolean;
  setMode: (mode: Mode) => void;
  /** Set the active mode WITHOUT locking it (panel follows Ana on voice turns). */
  setActiveMode: (mode: Mode) => void;
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
}

export const useUiStore = create<UiState>((set) => ({
  activeMode: 'Understand',
  modeLocked: false,
  setMode: (mode) => set({ activeMode: mode, modeLocked: true }),
  setActiveMode: (mode) => set({ activeMode: mode }),
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
}));
