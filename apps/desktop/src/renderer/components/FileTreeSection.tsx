import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { FileTree } from './FileTree';

/**
 * Collapsible "Files" section in the left sidebar. Purely user-toggled — its
 * expanded state stays constant across Understand/Plan/Build so the sidebar
 * never shifts on a mode switch.
 */
export function FileTreeSection(): JSX.Element {
  const [expanded, setExpanded] = useState(false);

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
