import { useMemo } from 'react';
import { useRepoStore } from '../store/repoStore';
import { useUiStore } from '../store/uiStore';
import type { RepoTreeNode } from '../../types';

/** Flat file tree showing name + path; click to open in side pane. */
export function FileTree(): JSX.Element {
  const tree = useRepoStore((s) => s.tree);
  const { openFile, openFiles } = useUiStore();

  const files = useMemo(
    () => tree.filter((n) => n.type === 'file').sort((a, b) => a.path.localeCompare(b.path)),
    [tree],
  );

  if (files.length === 0) {
    return <p className="px-4 py-2 text-sm text-ana-text-muted">No files loaded yet.</p>;
  }

  const isFileOpen = (path: string) => openFiles.some((f) => f.path === path);

  return (
    <ul className="overflow-auto text-sm divide-y divide-ana-border">
      {files.map((node: RepoTreeNode) => (
        <li
          key={node.path}
          onClick={() => openFile(node.path, node.name)}
          className={`px-4 py-2 cursor-pointer transition-colors ${
            isFileOpen(node.path)
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
      ))}
    </ul>
  );
}
