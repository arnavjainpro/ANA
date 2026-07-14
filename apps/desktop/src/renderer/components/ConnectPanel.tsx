import { useState } from 'react';
import { ChevronDown, Zap, RefreshCw } from 'lucide-react';
import { useRepoStore } from '../store/repoStore';
import { isIpcError } from '../lib/ipc';
import { Button, GithubIcon } from './ui';

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
    <div className="flex flex-col gap-3 border-b border-surface-border bg-surface-raised p-4">
      {!connected ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-xs leading-relaxed text-text-secondary">
            Connect your GitHub repository to get started.
          </p>
          <Button
            variant="primary"
            onClick={handleConnect}
            loading={busy}
            aria-busy={busy}
            aria-label="Connect GitHub"
            className="w-full"
          >
            {!busy && <GithubIcon size={14} />}
            Connect GitHub
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Repository
            </label>
            <div className="relative">
              <select
                value={selectedRepo?.full_name ?? ''}
                onChange={(e) => handleSelectRepo(e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-md border border-surface-border bg-surface-overlay px-3 py-2 pr-8 text-sm text-text-primary outline-none transition-colors duration-150 hover:bg-surface-hover focus:border-accent-border focus:shadow-focus-brand disabled:opacity-50"
              >
                <option value="">Choose a repo…</option>
                {repos.map((repo) => (
                  <option key={repo.id} value={repo.full_name}>
                    {repo.full_name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                strokeWidth={1.75}
                aria-hidden
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
              />
            </div>
          </div>

          {selectedRepo && (
            <>
              <Button
                variant="secondary"
                onClick={handleIndex}
                disabled={indexing}
                aria-busy={indexing}
                className="w-full"
              >
                {ready ? (
                  <RefreshCw
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden
                    className={`text-accent-primary ${indexing ? 'animate-spin' : ''}`}
                  />
                ) : (
                  <Zap
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden
                    className={`text-accent-primary ${indexing ? 'animate-spin' : ''}`}
                  />
                )}
                {ready ? 'Re-index' : indexing ? 'Indexing…' : 'Index repo'}
              </Button>

              {indexMessage && (
                <p
                  className={`text-xs leading-relaxed ${
                    indexStatus === 'error' ? 'text-status-danger' : 'text-text-secondary'
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
