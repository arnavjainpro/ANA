import { useMemo } from 'react';
import { useRepoStore } from '../store/repoStore';
import { useUiStore } from '../store/uiStore';
import { useBuildStore } from '../store/buildStore';
import type { RepoTreeNode } from '../../types';

/**
 * The single repository file tree, shown in the left sidebar across all modes.
 * In Build mode a click opens the file in the workspace editor (read from the
 * local working copy via `buildStore.openFile`). In other modes there is no
 * file viewer, so clicks are inert.
 */
export function FileTree(): JSX.Element {
  const tree = useRepoStore((s) => s.tree);
  const buildMode = useUiStore((s) => s.activeMode === 'Build');
  const openBuildFile = useBuildStore((s) => s.openFile);
  const openPath = useBuildStore((s) => s.openPath);

  const files = useMemo(
    () => tree.filter((n) => n.type === 'file').sort((a, b) => a.path.localeCompare(b.path)),
    [tree],
  );

  if (files.length === 0) {
    return <p className="px-4 py-2 text-sm text-ana-text-muted">No files loaded yet.</p>;
  }

  return (
    <ul className="overflow-auto text-sm divide-y divide-ana-border">
      {files.map((node: RepoTreeNode) => {
        const isOpen = buildMode && openPath === node.path;
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
            </div>
          </li>
        );
      })}
    </ul>
  );
}
