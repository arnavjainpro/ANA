import { create } from 'zustand';
import { useBuildStore } from './buildStore';
import { useUiStore } from './uiStore';
import { isIpcError } from '../lib/ipc';

interface TerminalState {
  /** The one shared PTY session id, or null before it's been created. */
  sessionId: string | null;
  error: string | null;
  /** Idempotent: returns the existing session, or creates one if none exists. */
  ensureSession: () => Promise<string | null>;
  /** Open the panel and run a full command line — used by voice-triggered requests. */
  runCommand: (command: string) => Promise<boolean>;
}

// Module-scoped (not store state) so concurrent callers await the same
// in-flight creation instead of racing two `terminal:create` calls.
let creating: Promise<string | null> | null = null;

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessionId: null,
  error: null,

  ensureSession: async () => {
    const existing = get().sessionId;
    if (existing) return existing;
    if (creating) return creating;
    creating = (async () => {
      const cwd = useBuildStore.getState().repoPath ?? undefined;
      const result = await window.ana.terminal.create(cwd);
      creating = null;
      if (isIpcError(result)) {
        set({ error: result.error });
        return null;
      }
      set({ sessionId: result.id, error: null });
      return result.id;
    })();
    return creating;
  },

  runCommand: async (command) => {
    useUiStore.getState().setTerminalOpen(true);
    // Give the (always-mounted) TerminalPanel a tick to notice the panel just
    // opened and attach its output listener before we write anything — else
    // the first bytes of this command's output can arrive with nothing
    // subscribed yet and never reach the screen.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const id = await get().ensureSession();
    if (!id) return false;
    const result = await window.ana.terminal.run(id, command);
    if (isIpcError(result)) {
      set({ error: result.error });
      return false;
    }
    return true;
  },
}));
