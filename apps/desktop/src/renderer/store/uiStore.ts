import { create } from 'zustand';
import type { Mode, WindowMode, WindowModeState } from '../../types';

interface UiState {
  activeMode: Mode;
  /** When false the mode follows Ana's intent classification automatically. */
  modeLocked: boolean;
  setMode: (mode: Mode) => void;
  /** Set the active mode WITHOUT locking it (panel follows Ana on voice turns). */
  setActiveMode: (mode: Mode) => void;
  toggleModeLock: () => void;
  
  // Sidebar and panel management (panel sizes persist via the layout's
  // localStorage-backed useDefaultLayout, not the store)
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;

  setSidebarOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;

  /**
   * True while a Claude reasoning turn is in flight (Phases 4–5). Drives the
   * right-panel skeleton + `aria-busy`. Set on turn start, cleared on payload.
   */
  isPanelLoading: boolean;
  setPanelLoading: (loading: boolean) => void;

  /**
   * Mirror of the main-process window presentation (full split layout vs the
   * floating popup). The main process is the source of truth — only update this
   * from `window:mode-changed` pushes or `window.ana.window.getMode()`.
   */
  windowMode: WindowMode;
  popupExpanded: boolean;
  setWindowState: (state: WindowModeState) => void;

  /** Typed-message composer below the Ana face; hidden unless toggled on. */
  composerOpen: boolean;
  toggleComposer: () => void;

  // Integrated terminal (bottom panel, VS Code style)
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  toggleTerminal: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeMode: 'Understand',
  modeLocked: false,
  setMode: (mode) => set({ activeMode: mode, modeLocked: true }),
  setActiveMode: (mode) => set({ activeMode: mode }),
  toggleModeLock: () => set((s) => ({ modeLocked: !s.modeLocked })),
  
  sidebarOpen: true,
  commandPaletteOpen: false,

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  isPanelLoading: false,
  setPanelLoading: (isPanelLoading) => set({ isPanelLoading }),

  windowMode: 'full',
  popupExpanded: false,
  setWindowState: ({ mode, popupExpanded }) => set({ windowMode: mode, popupExpanded }),

  composerOpen: false,
  toggleComposer: () => set((s) => ({ composerOpen: !s.composerOpen })),

  terminalOpen: false,
  setTerminalOpen: (open) => set({ terminalOpen: open }),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
}));
