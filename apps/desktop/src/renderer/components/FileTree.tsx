import { useMemo } from 'react';
import { useRepoStore } from '../store/repoStore';
import type { RepoTreeNode } from '../../types';

/** Flat file tree showing name + path only (no contents). */
export function FileTree(): JSX.Element {
  const tree = useRepoStore((s) => s.tree);

  const files = useMemo(
    () => tree.filter((n) => n.type === 'file').sort((a, b) => a.path.localeCompare(b.path)),
    [tree],
  );

  if (files.length === 0) {
    return <p className="px-3 py-2 text-sm text-gray-500">No files loaded yet.</p>;
  }

  return (
    <ul className="overflow-auto text-sm">
      {files.map((node: RepoTreeNode) => (
        <li
          key={node.path}
          className="flex flex-col border-b border-ana-border/50 px-3 py-1.5"
          title={node.path}
        >
          <span className="text-gray-200">{node.name}</span>
          <span className="truncate text-xs text-gray-500">{node.path}</span>
        </li>
      ))}
    </ul>
  );
}
