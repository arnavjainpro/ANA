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
    setRepoId,
    setError,
  } = useRepoStore();
  const [busy, setBusy] = useState(false);

  async function handleConnect(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await window.ana.auth.connectGitHub();
    if (isIpcError(result)) {
      setError(result.error);
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
    const unsubscribe = window.ana.repo.onIndexProgress((p) => {
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
    <div className="flex flex-col gap-3 border-b border-ana-border p-3">
      {!connected ? (
        <button
          type="button"
          onClick={handleConnect}
          disabled={busy}
          className="rounded-md bg-ana-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Connecting…' : 'Connect GitHub'}
        </button>
      ) : (
        <>
          <select
            value={selectedRepo?.full_name ?? ''}
            onChange={(e) => handleSelectRepo(e.target.value)}
            className="rounded-md border border-ana-border bg-ana-bg px-2 py-1.5 text-sm"
          >
            <option value="">Select a repo…</option>
            {repos.map((repo) => (
              <option key={repo.id} value={repo.full_name}>
                {repo.full_name}
              </option>
            ))}
          </select>

          {selectedRepo && (
            <button
              type="button"
              onClick={handleIndex}
              disabled={indexStatus === 'indexing'}
              className="rounded-md border border-ana-border px-3 py-1.5 text-sm hover:border-ana-accent disabled:opacity-50"
            >
              {indexStatus === 'ready' ? 'Re-index' : 'Index repo'}
            </button>
          )}

          {indexMessage && (
            <p
              className={
                indexStatus === 'error' ? 'text-xs text-red-400' : 'text-xs text-gray-400'
              }
            >
              {indexMessage}
            </p>
          )}
        </>
      )}
    </div>
  );
}
