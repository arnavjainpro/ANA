import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
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
        className="flex cursor-pointer items-center gap-2 border-t border-surface-border px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary transition-colors duration-150 hover:text-text-primary"
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          aria-hidden
          className={`flex-shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        />
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
