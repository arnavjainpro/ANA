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

  return (
    <div className="flex flex-col gap-3 border-b border-ana-border p-4 bg-ana-panel">
      {!connected ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ana-text-muted">Connect your GitHub repository to get started.</p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy}
            aria-disabled={busy}
            aria-busy={busy}
            aria-label="Connect GitHub"
            className="rounded px-3 py-2 text-sm font-medium text-ana-bg bg-ana-accent hover:bg-ana-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? (
              <svg
                aria-hidden="true"
                className="inline h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              'Connect GitHub'
            )}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-ana-text-muted uppercase tracking-wide">
              Select Repository
            </label>
            <select
              value={selectedRepo?.full_name ?? ''}
              onChange={(e) => handleSelectRepo(e.target.value)}
              className="rounded border border-ana-border bg-ana-bg px-2 py-1.5 text-sm text-ana-text outline-none focus:border-ana-accent disabled:opacity-50"
            >
              <option value="">Choose a repo…</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.full_name}>
                  {repo.full_name}
                </option>
              ))}
            </select>
          </div>

          {selectedRepo && (
            <>
              <button
                type="button"
                onClick={handleIndex}
                disabled={indexStatus === 'indexing'}
                aria-disabled={indexStatus === 'indexing'}
                aria-busy={indexStatus === 'indexing'}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  indexStatus === 'ready'
                    ? 'border border-ana-border text-ana-text hover:bg-ana-hover'
                    : 'border border-ana-border text-ana-text hover:bg-ana-hover disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {indexStatus === 'ready' ? '↻ Re-index' : '⚡ Index repo'}
              </button>

              {indexMessage && (
                <p
                  className={`text-xs ${
                    indexStatus === 'error'
                      ? 'text-red-400'
                      : 'text-ana-text-muted'
                  }`}
                >
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
