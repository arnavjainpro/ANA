import { useMemo } from 'react';
import { useRepoStore } from '../store/repoStore';
import { useUiStore } from '../store/uiStore';
import { useBuildStore } from '../store/buildStore';
import type { RepoTreeNode } from '../../types';

/**
 * The single repository file tree, shown in the left sidebar across all modes.
 *
 * In Build mode the list comes from the local working copy (`buildStore.localTree`)
 * so it matches what Ana actually edits — including untracked files — and a click
 * opens the file in the workspace editor. Git-modified files get a dot. In other
 * modes it shows the GitHub tree (`repoStore.tree`) and is browse-only, since
 * there is no editor to open into.
 */
export function FileTree(): JSX.Element {
  const githubTree = useRepoStore((s) => s.tree);
  const buildMode = useUiStore((s) => s.activeMode === 'Build');
  const localTree = useBuildStore((s) => s.localTree);
  const gitStatus = useBuildStore((s) => s.gitStatus);
  const openBuildFile = useBuildStore((s) => s.openFile);
  const openPath = useBuildStore((s) => s.openPath);

  const source = buildMode ? localTree : githubTree;

  const files = useMemo(
    () => source.filter((n) => n.type === 'file').sort((a, b) => a.path.localeCompare(b.path)),
    [source],
  );

  const modified = useMemo(
    () =>
      new Set<string>([
        ...(gitStatus?.staged ?? []),
        ...(gitStatus?.unstaged ?? []),
        ...(gitStatus?.untracked ?? []),
      ]),
    [gitStatus],
  );

  if (files.length === 0) {
    return <p className="px-4 py-3 text-sm text-ana-text-muted">No files loaded yet.</p>;
  }

  return (
    <ul className="overflow-auto py-1 text-sm">
      {files.map((node: RepoTreeNode, i) => {
        const isOpen = buildMode && openPath === node.path;
        const isModified = buildMode && modified.has(node.path);
        // The directory prefix shown muted before the filename, for context.
        const dir = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/') + 1) : '';
        return (
          <li
            key={node.path}
            onClick={buildMode ? () => void openBuildFile(node.path) : undefined}
            // Stagger the entrance across the first rows so the tree assembles
            // rather than snapping in. Capped so long trees don't lag visibly.
            style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}
            className={`group relative mx-1.5 flex animate-fade-in-up items-center gap-2 rounded-md py-1.5 pl-3 pr-2 transition-colors duration-150 ${
              buildMode ? 'cursor-pointer' : 'cursor-default'
            } ${isOpen ? 'bg-ana-brand-soft text-ana-text' : 'text-ana-text-muted hover:bg-ana-hover hover:text-ana-text'}`}
            title={node.path}
          >
            {/* Active indicator: an indigo bar on the left edge of the open row. */}
            <span
              aria-hidden="true"
              className={`absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-ana-brand transition-opacity duration-150 ${
                isOpen ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <svg
              className={`h-4 w-4 flex-shrink-0 transition-colors ${isOpen ? 'text-ana-brand' : 'text-ana-text-muted group-hover:text-ana-text'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="min-w-0 flex-1 truncate">
              {dir && <span className="text-ana-text-muted/60">{dir}</span>}
              <span className={`font-medium ${isOpen ? 'text-ana-text' : ''}`}>{node.name}</span>
            </span>
            {isModified && (
              <span
                aria-label="Modified"
                title="Modified"
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
