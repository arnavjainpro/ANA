import { useEffect } from 'react';
import { useRepoStore } from '../../store/repoStore';
import { useBuildStore } from '../../store/buildStore';
import { ChangedFilesList } from './ChangedFilesList';
import { CodeEditor } from './CodeEditor';
import { UndoBar } from './UndoBar';

/**
 * Build mode right-panel: read-only Monaco editor + undo bar. The repository
 * file tree lives in the shared left sidebar (`FileTree`) and drives which file
 * opens here. On entry this resolves the local working-copy path for the
 * connected repo, prompting for a folder the first time (validated against the
 * repo name in the main process).
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
        <PanelHeader subtitle="Ana edits your local working copy" />
        <BuildEmptyState
          title="No repository selected"
          body="Connect and select a repository to start building."
        />
      </div>
    );
  }

  if (!repoPath) {
    return (
      <div className="flex h-full flex-col bg-ana-bg">
        <PanelHeader subtitle="Ana edits your local working copy" />
        <div className="flex flex-1 animate-fade-in-up flex-col items-center justify-center gap-4 p-8 text-center">
          <FolderIcon />
          <p className="max-w-sm text-sm leading-relaxed text-ana-text-muted">
            Choose your local clone of{' '}
            <span className="font-medium text-ana-text">{selectedRepo.full_name}</span> so Ana can make
            changes.
          </p>
          <button
            type="button"
            onClick={() => void selectRepoPath(selectedRepo.full_name)}
            disabled={selectingPath}
            aria-disabled={selectingPath}
            className="flex items-center gap-2 rounded-md bg-ana-brand px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-ana-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
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
      <PanelHeader subtitle={repoPath} subtitleTitle={repoPath} mono />
      <ChangedFilesList />
      <div className="min-h-0 flex-1">
        <CodeEditor />
      </div>
      <UndoBar />
    </div>
  );
}

/** Frosted-glass panel header, matching the Understand diagram panel chrome. */
function PanelHeader({
  subtitle,
  subtitleTitle,
  mono,
}: {
  subtitle: string;
  subtitleTitle?: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="border-b border-ana-border bg-ana-panel px-6 py-3">
      <h2 tabIndex={-1} className="text-sm font-semibold tracking-tight text-ana-text outline-none">
        Build
      </h2>
      <p
        className={`mt-0.5 truncate text-xs text-ana-text-muted ${mono ? 'font-mono' : ''}`}
        title={subtitleTitle}
      >
        {subtitle}
      </p>
    </div>
  );
}

function BuildEmptyState({ title, body }: { title: string; body: string }): JSX.Element {
  return (
    <div className="flex flex-1 animate-fade-in-up flex-col items-center justify-center gap-3 p-8 text-center">
      <FolderIcon />
      <div>
        <p className="text-sm font-medium text-ana-text">{title}</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-ana-text-muted">{body}</p>
      </div>
    </div>
  );
}

function FolderIcon(): JSX.Element {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-ana-border bg-ana-panel">
      <svg
        aria-hidden="true"
        className="h-6 w-6 text-ana-text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    </span>
  );
}
