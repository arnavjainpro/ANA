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
    return <p className="px-4 py-2 text-sm text-ana-text-muted">No files loaded yet.</p>;
  }

  return (
    <ul className="overflow-auto text-sm divide-y divide-ana-border">
      {files.map((node: RepoTreeNode) => {
        const isOpen = buildMode && openPath === node.path;
        const isModified = buildMode && modified.has(node.path);
        return (
          <li
            key={node.path}
            onClick={buildMode ? () => void openBuildFile(node.path) : undefined}
            className={`px-4 py-2 transition-colors ${
              buildMode ? 'cursor-pointer' : 'cursor-default'
            } ${
              isOpen
                ? 'bg-ana-hover text-ana-accent'
                : 'text-ana-text hover:bg-ana-hover hover:text-ana-text'
            }`}
            title={node.path}
          >
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-ana-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{node.name}</p>
                <p className="truncate text-xs text-ana-text-muted mt-0.5">{node.path}</p>
              </div>
              {isModified && (
                <span
                  aria-label="Modified"
                  className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-yellow-400"
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
