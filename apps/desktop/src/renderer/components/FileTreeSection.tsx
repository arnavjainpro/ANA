import { useEffect, useState } from 'react';
import { useUiStore } from '../store/uiStore';
import { FileTree } from './FileTree';

/**
 * Collapsible "Files" section in the left sidebar. The file list is loaded as
 * soon as a repo is selected, but it stays out of the way in Understand/Plan
 * (where files aren't the subject) and auto-expands in Build (where you browse
 * and open the file Ana is editing). The user can still toggle it manually; a
 * manual toggle persists until the next mode change.
 */
export function FileTreeSection(): JSX.Element {
  const buildMode = useUiStore((s) => s.activeMode === 'Build');
  const [expanded, setExpanded] = useState(buildMode);

  // Follow the mode: open in Build, closed elsewhere.
  useEffect(() => {
    setExpanded(buildMode);
  }, [buildMode]);

  return (
    <div className={`flex min-h-0 flex-col ${expanded ? 'flex-1' : ''}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-2 border-t border-ana-border px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ana-text-muted transition-colors hover:text-ana-text"
      >
        <svg
          aria-hidden="true"
          className={`h-3 w-3 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Files
      </button>
      {expanded && (
        <div className="flex-1 overflow-auto">
          <FileTree />
        </div>
      )}
    </div>
  );
}
