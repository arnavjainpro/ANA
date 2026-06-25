import { useEffect, useRef, useState } from 'react';
import { useRepoStore } from '../store/repoStore';
import { isIpcError } from '../lib/ipc';

/**
 * "Refresh context" control for the Ana pane. After indexing a repo, the user
 * presses this to re-announce the active repo to the backend so the next thing
 * they say to Ana is repo-aware. Deliberately does NOT restart the Tavus video
 * — context is read fresh per turn, so a silent re-sync is enough. Shows a brief
 * "Context updated" confirmation, then fades back to the button.
 */
export function RefreshContext(): JSX.Element | null {
  const repoId = useRepoStore((s) => s.repoId);
  const indexStatus = useRepoStore((s) => s.indexStatus);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);

  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  // Only meaningful once a repo is actually indexed and ready.
  if (!repoId || indexStatus !== 'ready') return null;

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
    <div className="flex items-center gap-2 border-b border-ana-border bg-ana-panel px-3 py-1.5">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={busy}
        aria-busy={busy}
        aria-label="Refresh Ana's context"
        className="flex items-center gap-1.5 rounded-lg border border-ana-border bg-ana-bg/60 px-2.5 py-1 text-xs font-medium text-ana-text transition-colors duration-150 hover:border-ana-brand-border hover:bg-ana-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          className={`h-3.5 w-3.5 text-ana-brand ${busy ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh context
      </button>
      {confirmed && (
        <span aria-live="polite" className="flex animate-fade-in-up items-center gap-1 text-xs font-medium text-emerald-400">
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Context updated
        </span>
      )}
      {error && (
        <span aria-live="polite" className="text-xs text-red-400">
          {error}
        </span>
      )}
    </div>
  );
}
