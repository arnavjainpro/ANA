import { create } from 'zustand';

export type ToastVariant = 'success' | 'info' | 'error';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
  /** Show a toast; it auto-dismisses after ~4s. Returns the generated id. */
  pushToast: (message: string, variant?: ToastVariant) => number;
  dismissToast: (id: number) => void;
}

const AUTO_DISMISS_MS = 4000;
let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  pushToast: (message, variant = 'info') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    setTimeout(() => get().dismissToast(id), AUTO_DISMISS_MS);
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire-and-forget helper for non-React call sites (stores, async handlers). */
export function pushToast(message: string, variant?: ToastVariant): void {
  useToastStore.getState().pushToast(message, variant);
}
