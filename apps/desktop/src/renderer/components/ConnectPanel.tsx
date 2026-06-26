import { useState } from 'react';
import { useRepoStore } from '../store/repoStore';
import { isIpcError } from '../lib/ipc';

/** GitHub connect + repo selection + indexing controls. */
export function ConnectPanel(): JSX.Element {
  const {
    connected,
    repos,
    selectedRepo,
    indexStatus,
    indexMessage,
    setConnected,
    setRepos,
    selectRepo,
    setTree,
    setIndexStatus,
    setIndexProgress,
    setRepoId,
    setError,
  } = useRepoStore();
  const [busy, setBusy] = useState(false);

  async function handleConnect(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await window.ana.auth.connectGitHub();
    if (isIpcError(result)) {
      // The user closing the OAuth window mid-flow is a cancellation, not an
      // error — reset the button silently rather than surfacing a message.
      if (!/cancel|closed|abort/i.test(result.error)) setError(result.error);
      setBusy(false);
      return;
    }
    setConnected(true, result.login);
    const repoResult = await window.ana.repo.list();
    if (isIpcError(repoResult)) {
      setError(repoResult.error);
    } else {
      setRepos(repoResult.repos);
    }
    setBusy(false);
  }

  async function handleSelectRepo(fullName: string): Promise<void> {
    const repo = repos.find((r) => r.full_name === fullName);
    if (!repo) return;
    selectRepo(repo);
    setError(null);
    // Drop the previous repo's context until this one is indexed + refreshed,
    // so Ana doesn't keep answering about the repo you just switched away from.
    void window.ana.conversation.resetContext();

    const treeResult = await window.ana.repo.tree(repo.full_name, repo.default_branch);
    if (isIpcError(treeResult)) {
      setError(treeResult.error);
      return;
    }
    setTree(treeResult.tree);
  }

  async function handleIndex(): Promise<void> {
    if (!selectedRepo) return;
    setIndexStatus('indexing', 'Starting…');
    setIndexProgress(0, 0);
    const unsubscribe = window.ana.repo.onIndexProgress((p) => {
      setIndexProgress(p.processed, p.total);
      setIndexStatus('indexing', `Indexing… ${p.processed}/${p.total} files`);
    });
    const result = await window.ana.repo.index(selectedRepo.full_name);
    unsubscribe();
    if (isIpcError(result)) {
      setIndexStatus('error', result.error);
      setError(result.error);
      return;
    }
    setRepoId(result.repoId);
    setIndexStatus('ready', `Indexed ${result.filesIndexed} files (${result.chunksStored} chunks)`);
  }

  const indexing = indexStatus === 'indexing';
  const ready = indexStatus === 'ready';

  return (
    <div className="flex flex-col gap-3 border-b border-ana-border bg-ana-panel p-4">
      {!connected ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-xs leading-relaxed text-ana-text-muted">
            Connect your GitHub repository to get started.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy}
            aria-disabled={busy}
            aria-busy={busy}
            aria-label="Connect GitHub"
            className="flex items-center justify-center gap-2 rounded-md bg-ana-brand px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-ana-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <svg aria-hidden="true" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <>
                <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                Connect GitHub
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ana-text-muted">
              Repository
            </label>
            <div className="relative">
              <select
                value={selectedRepo?.full_name ?? ''}
                onChange={(e) => handleSelectRepo(e.target.value)}
                className="w-full appearance-none rounded-md border border-ana-border bg-ana-bg px-3 py-2 pr-8 text-sm text-ana-text outline-none transition-colors duration-150 focus:border-ana-brand-border focus:shadow-focus-brand disabled:opacity-50"
              >
                <option value="">Choose a repo…</option>
                {repos.map((repo) => (
                  <option key={repo.id} value={repo.full_name}>
                    {repo.full_name}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ana-text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {selectedRepo && (
            <>
              <button
                type="button"
                onClick={handleIndex}
                disabled={indexing}
                aria-disabled={indexing}
                aria-busy={indexing}
                className="flex items-center justify-center gap-2 rounded-md border border-ana-border bg-ana-bg px-3 py-2 text-sm font-medium text-ana-text transition-colors duration-150 hover:bg-ana-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  aria-hidden="true"
                  className={`h-4 w-4 text-ana-brand ${indexing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {ready ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  )}
                </svg>
                {ready ? 'Re-index' : indexing ? 'Indexing…' : 'Index repo'}
              </button>

              {indexMessage && (
                <p className={`text-xs leading-relaxed ${indexStatus === 'error' ? 'text-red-400' : 'text-ana-text-muted'}`}>
                  {indexMessage}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
