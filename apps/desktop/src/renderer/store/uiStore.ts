import { create } from 'zustand';
import type { Mode } from '../../types';

interface UiState {
  activeMode: Mode;
  /** When false the mode follows Ana's intent classification automatically. */
  modeLocked: boolean;
  setMode: (mode: Mode) => void;
  toggleModeLock: () => void;
  
  // New: sidebar and panel management
  sidebarOpen: boolean;
  sidebarWidth: number; // in pixels, default 280
  showAnaFace: boolean;
  commandPaletteOpen: boolean;
  
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setShowAnaFace: (show: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
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
}));
