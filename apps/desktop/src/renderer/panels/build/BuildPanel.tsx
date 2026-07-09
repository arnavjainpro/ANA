import { useEffect } from 'react';
import { useRepoStore } from '../../store/repoStore';
import { useBuildStore } from '../../store/buildStore';
import { useUiStore } from '../../store/uiStore';
import { ChangedFilesList } from './ChangedFilesList';
import { CodeEditor } from './CodeEditor';
import { UndoBar } from './UndoBar';

/**
 * Build mode right-panel: read-only Monaco editor + undo bar.
 *
 * Files are loaded from GitHub (no local folder needed to browse). A local
 * folder is only required when Ana actually applies a change — a small inline
 * prompt appears in that case. On entry we silently check for a previously
 * saved local path so it's ready if the user asks Ana to make a change.
 */
export function BuildPanel(): JSX.Element {
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const githubTree = useRepoStore((s) => s.tree);
  const repoPath = useBuildStore((s) => s.repoPath);
  const pathChecked = useBuildStore((s) => s.pathChecked);
  const selectingPath = useBuildStore((s) => s.selectingPath);
  const error = useBuildStore((s) => s.error);
  const openPath = useBuildStore((s) => s.openPath);
  const ensureRepoPath = useBuildStore((s) => s.ensureRepoPath);
  const selectRepoPath = useBuildStore((s) => s.selectRepoPath);
  const openGitHubFile = useBuildStore((s) => s.openGitHubFile);
  const activeMode = useUiStore((s) => s.activeMode);

  // Silently resolve a previously saved local path on Build entry.
  useEffect(() => {
    if (selectedRepo && !pathChecked) void ensureRepoPath(selectedRepo.full_name);
  }, [selectedRepo, pathChecked, ensureRepoPath]);

  // Auto-open the best default file when entering Build mode with a tree loaded.
  useEffect(() => {
    if (activeMode !== 'Build' || !selectedRepo || openPath || githubTree.length === 0) return;
    const file = pickDefaultFile(githubTree);
    if (file) void openGitHubFile(selectedRepo.full_name, file);
  }, [activeMode, selectedRepo, githubTree, openPath, openGitHubFile]);

  if (!selectedRepo) {
    return (
      <div className="flex h-full flex-col bg-ana-bg">
        <PanelHeader title="Build" subtitle="Ana edits your local working copy" />
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="text-sm text-ana-text-muted">
            Connect and select a repository to start browsing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-ana-bg">
      <PanelHeader title="Build" subtitle={selectedRepo.full_name} />

      {/* Inline local-folder prompt — only shown when Ana needs to apply changes */}
      {!repoPath && (
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-ana-border bg-ana-panel px-4 py-2">
          <p className="flex-1 text-xs text-ana-text-muted">
            Select your local clone so Ana can apply changes.
          </p>
          <button
            type="button"
            onClick={() => void selectRepoPath(selectedRepo.full_name)}
            disabled={selectingPath}
            aria-disabled={selectingPath}
            className="flex-shrink-0 rounded-md bg-ana-brand px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-ana-brand-hover disabled:opacity-50"
          >
            {selectingPath ? 'Opening…' : 'Select folder'}
          </button>
        </div>
      )}

      {error && (
        <p className="flex-shrink-0 border-b border-red-900/30 bg-red-950/20 px-4 py-1.5 text-xs text-red-400">
          {error}
        </p>
      )}

      <ChangedFilesList />
      <div className="min-h-0 flex-1">
        <CodeEditor />
      </div>
      <UndoBar />
    </div>
  );
}

function pickDefaultFile(tree: { path: string; type: string }[]): string | null {
  const files = tree.filter((n) => n.type === 'file').map((n) => n.path);
  const fileset = new Set(files);
  const PRIORITY = [
    'README.md', 'readme.md',
    'index.ts', 'index.tsx', 'main.ts', 'main.tsx', 'main.py',
    'App.tsx', 'app.tsx',
    'package.json',
  ];
  for (const name of PRIORITY) {
    if (fileset.has(name)) return name;
  }
  return files[0] ?? null;
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }): JSX.Element {
  return (
    <div className="border-b border-ana-border bg-ana-panel px-6 py-3">
      <h2 tabIndex={-1} className="text-sm font-semibold tracking-tight text-ana-text outline-none">
        {title}
      </h2>
      <p className="mt-0.5 truncate text-xs text-ana-text-muted">{subtitle}</p>
    </div>
  );
}
