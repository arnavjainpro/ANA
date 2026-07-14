import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Check, Keyboard } from 'lucide-react';
import { useRepoStore } from '../store/repoStore';
import { useUiStore } from '../store/uiStore';
import { isIpcError } from '../lib/ipc';

/**
 * Controls strip at the top of the Ana pane: "Refresh context" (re-announce the
 * active repo to the backend so the next thing the user says is repo-aware —
 * deliberately does NOT restart the Tavus video) and the typed-composer toggle.
 * Refresh shows a brief "Context updated" confirmation, then fades back.
 */
export function RefreshContext(): JSX.Element | null {
  const repoId = useRepoStore((s) => s.repoId);
  const indexStatus = useRepoStore((s) => s.indexStatus);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const composerOpen = useUiStore((s) => s.composerOpen);
  const toggleComposer = useUiStore((s) => s.toggleComposer);

  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const ready = repoId !== null && indexStatus === 'ready';

  async function handleRefresh(): Promise<void> {
    if (!repoId) return;
    setBusy(true);
    setError(null);
    const result = await window.ana.conversation.syncRepo({
      repoId,
      repoFullName: selectedRepo?.full_name,
    });
    setBusy(false);
    if (isIpcError(result)) {
      setError(result.error);
      return;
    }
    setConfirmed(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setConfirmed(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 border-b border-surface-border bg-surface-raised px-3 py-1.5">
      {ready && (
        <button
          type="button"
          onClick={handleRefresh}
          disabled={busy}
          aria-busy={busy}
          aria-label="Refresh Ana's context"
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-surface-border bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-primary transition-colors duration-150 hover:border-accent-border hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={12}
            strokeWidth={2}
            aria-hidden
            className={`text-accent-primary ${busy ? 'animate-spin' : ''}`}
          />
          Refresh context
        </button>
      )}
      {confirmed && (
        <span
          aria-live="polite"
          className="flex animate-fade-in-up items-center gap-1 text-xs font-medium text-status-success"
        >
          <Check size={12} strokeWidth={2} aria-hidden />
          Context updated
        </span>
      )}
      {error && (
        <span aria-live="polite" className="text-xs text-status-danger">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={toggleComposer}
        aria-label={composerOpen ? 'Hide typed input' : 'Show typed input'}
        aria-pressed={composerOpen}
        title={composerOpen ? 'Hide typed input' : 'Type to Ana instead of speaking'}
        className={`ml-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 hover:bg-surface-hover ${
          composerOpen ? 'text-accent-primary' : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        <Keyboard size={14} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
