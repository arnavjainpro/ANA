import { useMemo, useState, type ReactNode } from 'react';
import { useRepoStore } from '../store/repoStore';
import { useUiStore } from '../store/uiStore';
import { useBuildStore } from '../store/buildStore';
import type { RepoTreeNode } from '../../types';

/** A node in the nested tree we build from the flat path list. */
interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children: TreeNode[];
}

/**
 * Build a nested folder/file tree from a flat list of files. Intermediate
 * directories are derived from each file's path segments, so we don't depend on
 * the source including explicit directory entries.
 */
function buildTree(files: RepoTreeNode[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'dir', children: [] };
  const dirs = new Map<string, TreeNode>([['', root]]);

  for (const file of files) {
    const parts = file.path.split('/');
    let parent = root;
    let prefix = '';
    parts.forEach((part, i) => {
      const segPath = prefix ? `${prefix}/${part}` : part;
      if (i === parts.length - 1) {
        parent.children.push({ name: part, path: segPath, type: 'file', children: [] });
      } else {
        let dir = dirs.get(segPath);
        if (!dir) {
          dir = { name: part, path: segPath, type: 'dir', children: [] };
          dirs.set(segPath, dir);
          parent.children.push(dir);
        }
        parent = dir;
        prefix = segPath;
      }
    });
  }

  // Folders first, then files; alphabetical within each group.
  const sort = (node: TreeNode): void => {
    node.children.sort((a, b) =>
      a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name),
    );
    node.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

/** Small rounded language badge (e.g. "TS", "JS", "{}"). */
function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }): JSX.Element {
  return (
    <span
      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[3px] text-[7px] font-bold leading-none"
      style={{ backgroundColor: bg, color: fg }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}

/** A monochrome glyph (document, gear, lock) tinted by `color`. */
function Glyph({ color, children }: { color: string; children: ReactNode }): JSX.Element {
  return (
    <svg className="h-4 w-4 flex-shrink-0" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

const DOC_PATH = (
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
);

/** Pick an icon for a filename, matching the VS Code / Seti style at a glance. */
function fileIcon(name: string): JSX.Element {
  const lower = name.toLowerCase();
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : '';

  if (lower === 'package.json' || lower === 'package-lock.json') return <Badge text="{}" bg="#CBCB41" fg="#1a1a1d" />;
  if (lower.startsWith('.env')) {
    return (
      <Glyph color="#8a8a93">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </Glyph>
    );
  }
  if (lower.includes('.lock') || ext === 'lock') {
    return (
      <Glyph color="#8a8a93">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </Glyph>
    );
  }

  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
      return <Badge text="TS" bg="#3178C6" fg="#fff" />;
    case 'tsx':
      return <Badge text="TS" bg="#2D79C7" fg="#fff" />;
    case 'js':
    case 'mjs':
    case 'cjs':
      return <Badge text="JS" bg="#F0DB4F" fg="#1a1a1d" />;
    case 'jsx':
      return <Badge text="JS" bg="#61DAFB" fg="#1a1a1d" />;
    case 'json':
      return <Badge text="{}" bg="#CBCB41" fg="#1a1a1d" />;
    case 'md':
    case 'mdx':
      return <Badge text="M" bg="#519ABA" fg="#fff" />;
    case 'css':
    case 'scss':
      return <Badge text="#" bg="#519ABA" fg="#fff" />;
    case 'html':
      return <Badge text="<>" bg="#E44D26" fg="#fff" />;
    case 'py':
      return <Badge text="PY" bg="#3572A5" fg="#fff" />;
    case 'yml':
    case 'yaml':
      return <Badge text="Y" bg="#CB171E" fg="#fff" />;
    case 'sh':
      return <Badge text="$" bg="#4EAA25" fg="#fff" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
    case 'gif':
    case 'webp':
      return (
        <Glyph color="#A074C4">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </Glyph>
      );
    default:
      return <Glyph color="#8a8a93">{DOC_PATH}</Glyph>;
  }
}

/**
 * The repository file tree, shown in the left sidebar across all modes, rendered
 * as a collapsible nested explorer (folders → files) with file-type icons.
 *
 * In Build mode the list comes from the local working copy (`buildStore.localTree`)
 * so it matches what Ana actually edits — including untracked files — and a click
 * on a file opens it in the workspace editor. Git-modified files get a dot. In
 * other modes it shows the GitHub tree (`repoStore.tree`) and is browse-only.
 */
export function FileTree(): JSX.Element {
  const githubTree = useRepoStore((s) => s.tree);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const buildMode = useUiStore((s) => s.activeMode === 'Build');
  const openGitHubFile = useBuildStore((s) => s.openGitHubFile);
  const openPath = useBuildStore((s) => s.openPath);

  // Build mode now uses the same GitHub tree as other modes.
  const source = githubTree;

  const tree = useMemo(() => buildTree(source.filter((n) => n.type === 'file')), [source]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (path: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  if (tree.length === 0) {
    return <p className="px-4 py-3 text-sm text-ana-text-muted">No files loaded yet.</p>;
  }

  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      // Indentation: each level adds room; depth 0 starts flush with a small gutter.
      const pad = 8 + depth * 12;

      if (node.type === 'dir') {
        const isOpen = expanded.has(node.path);
        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => toggle(node.path)}
              aria-expanded={isOpen}
              style={{ paddingLeft: pad }}
              className="group flex w-full items-center gap-1.5 py-1 pr-2 text-left text-ana-text-muted transition-colors duration-100 hover:text-ana-text"
              title={node.path}
            >
              <svg
                aria-hidden="true"
                className={`h-3 w-3 flex-shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="whitespace-nowrap text-sm font-medium text-ana-text">{node.name}</span>
            </button>
            {isOpen && node.children.length > 0 && <ul>{renderNodes(node.children, depth + 1)}</ul>}
          </li>
        );
      }

      const isOpenFile = buildMode && openPath === node.path;
      return (
        <li key={node.path}>
          <div
            onClick={
              buildMode && selectedRepo
                ? () => void openGitHubFile(selectedRepo.full_name, node.path)
                : undefined
            }
            style={{ paddingLeft: pad + 18 }}
            className={`group relative flex w-full items-center gap-1.5 py-1 pr-2 transition-colors duration-100 ${
              buildMode ? 'cursor-pointer' : 'cursor-default'
            } ${isOpenFile ? 'bg-ana-brand-soft' : 'hover:bg-ana-hover'}`}
            title={node.path}
          >
            {isOpenFile && (
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ana-brand" />
            )}
            {fileIcon(node.name)}
            <span
              className={`flex-1 whitespace-nowrap text-sm ${
                isOpenFile ? 'text-ana-text' : 'text-ana-text-muted group-hover:text-ana-text'
              }`}
            >
              {node.name}
            </span>
          </div>
        </li>
      );
    });

  // w-max lets rows grow to their natural width so the wrapper scrolls sideways
  // for long names; min-w-full keeps hover/selection spanning the full width.
  return <ul className="w-max min-w-full py-1 text-sm">{renderNodes(tree, 0)}</ul>;
}
