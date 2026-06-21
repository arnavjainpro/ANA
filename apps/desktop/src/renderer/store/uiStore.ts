import { create } from 'zustand';
import type { Mode } from '../../types';

interface UiState {
  activeMode: Mode;
  /** When false the mode follows Ana's intent classification automatically. */
  modeLocked: boolean;
  setMode: (mode: Mode) => void;
  toggleModeLock: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeMode: 'Understand',
  modeLocked: false,
  setMode: (mode) => set({ activeMode: mode, modeLocked: true }),
  toggleModeLock: () => set((s) => ({ modeLocked: !s.modeLocked })),
}));
