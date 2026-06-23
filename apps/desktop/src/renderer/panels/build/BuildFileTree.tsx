import { useMemo } from 'react';
import { useRepoStore } from '../../store/repoStore';
import { useBuildStore } from '../../store/buildStore';
import type { RepoTreeNode } from '../../../types';

/** File tree for Build mode: click to open in Monaco; modified files get a dot. */
export function BuildFileTree(): JSX.Element {
  const tree = useRepoStore((s) => s.tree);
  const openPath = useBuildStore((s) => s.openPath);
  const openFile = useBuildStore((s) => s.openFile);
  const gitStatus = useBuildStore((s) => s.gitStatus);

  const files = useMemo(
    () => tree.filter((n) => n.type === 'file').sort((a, b) => a.path.localeCompare(b.path)),
    [tree],
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
    return <p className="px-4 py-2 text-xs text-ana-text-muted">No files loaded yet.</p>;
  }

  return (
    <ul aria-label="Repository file tree" className="overflow-auto text-sm">
      {files.map((node: RepoTreeNode) => {
        const isOpen = openPath === node.path;
        const isModified = modified.has(node.path);
        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => void openFile(node.path)}
              aria-current={isOpen ? 'true' : undefined}
              title={node.path}
              className={`flex w-full items-center justify-between gap-2 px-4 py-1.5 text-left transition-colors ${
                isOpen
                  ? 'bg-ana-hover text-ana-accent'
                  : 'text-ana-text hover:bg-ana-hover'
              }`}
            >
              <span className="truncate font-mono text-xs">{node.name}</span>
              {isModified && (
                <span
                  aria-label="Modified"
                  className="h-2 w-2 flex-shrink-0 rounded-full bg-yellow-400"
                />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
