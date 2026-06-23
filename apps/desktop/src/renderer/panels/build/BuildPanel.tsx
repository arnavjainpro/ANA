import { useEffect } from 'react';
import { useRepoStore } from '../../store/repoStore';
import { useBuildStore } from '../../store/buildStore';
import { BuildFileTree } from './BuildFileTree';
import { CodeEditor } from './CodeEditor';
import { UndoBar } from './UndoBar';

/**
 * Build mode right-panel: file tree + read-only Monaco editor + undo bar. On
 * entry it resolves the local working-copy path for the connected repo, prompting
 * for a folder the first time (validated against the repo name in the main process).
 */
export function BuildPanel(): JSX.Element {
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const repoPath = useBuildStore((s) => s.repoPath);
  const pathChecked = useBuildStore((s) => s.pathChecked);
  const selectingPath = useBuildStore((s) => s.selectingPath);
  const error = useBuildStore((s) => s.error);
  const ensureRepoPath = useBuildStore((s) => s.ensureRepoPath);
  const selectRepoPath = useBuildStore((s) => s.selectRepoPath);

  useEffect(() => {
    if (selectedRepo && !pathChecked) void ensureRepoPath(selectedRepo.full_name);
  }, [selectedRepo, pathChecked, ensureRepoPath]);

  if (!selectedRepo) {
    return (
      <div className="flex h-full flex-col bg-ana-bg">
        <div className="border-b border-ana-border px-6 py-4 bg-ana-panel">
          <h2 tabIndex={-1} className="text-lg font-semibold text-ana-text">Build</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-ana-text-muted">
            Connect and select a repository to start building.
          </p>
        </div>
      </div>
    );
  }

  if (!repoPath) {
    return (
      <div className="flex h-full flex-col bg-ana-bg">
        <div className="border-b border-ana-border px-6 py-4 bg-ana-panel">
          <h2 tabIndex={-1} className="text-lg font-semibold text-ana-text">Build</h2>
          <p className="mt-1 text-xs text-ana-text-muted">Ana edits your local working copy</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-ana-text-muted">
            Choose your local clone of <span className="text-ana-text">{selectedRepo.full_name}</span> so
            Ana can make changes.
          </p>
          <button
            type="button"
            onClick={() => void selectRepoPath(selectedRepo.full_name)}
            disabled={selectingPath}
            aria-disabled={selectingPath}
            className="rounded px-4 py-2 text-sm font-medium text-ana-bg bg-ana-accent hover:bg-ana-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {selectingPath ? 'Opening…' : 'Select local folder'}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-ana-bg">
      <div className="border-b border-ana-border px-6 py-4 bg-ana-panel">
        <h2 tabIndex={-1} className="text-lg font-semibold text-ana-text">Build</h2>
        <p className="mt-1 truncate text-xs text-ana-text-muted" title={repoPath}>
          {repoPath}
        </p>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 flex-shrink-0 overflow-auto border-r border-ana-border bg-ana-panel">
          <BuildFileTree />
        </aside>
        <div className="min-h-0 flex-1">
          <CodeEditor />
        </div>
      </div>
      <UndoBar />
    </div>
  );
}
