import { FileDiff } from 'lucide-react';
import { useBuildStore } from '../../store/buildStore';

/**
 * Horizontal bar of the files Ana changed in her last turn. Clicking one shows
 * its before/after diff in the editor. Hidden when there are no recent changes.
 */
export function ChangedFilesList(): JSX.Element | null {
  const lastPatches = useBuildStore((s) => s.lastPatches);
  const openPath = useBuildStore((s) => s.openPath);
  const openFile = useBuildStore((s) => s.openFile);

  if (lastPatches.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-surface-border bg-surface-raised px-3 py-2">
      <span className="flex flex-shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        <FileDiff size={12} strokeWidth={2} aria-hidden className="text-status-warning" />
        Changed
      </span>
      {lastPatches.map((patch) => {
        const name = patch.path.split('/').pop() ?? patch.path;
        const isActive = openPath === patch.path;
        return (
          <button
            key={patch.path}
            type="button"
            onClick={() => void openFile(patch.path)}
            title={`${patch.path} — ${patch.summary}`}
            aria-current={isActive ? 'true' : undefined}
            className={`flex-shrink-0 cursor-pointer rounded-md border px-2.5 py-1 font-mono text-xs transition-colors duration-150 ${
              isActive
                ? 'border-accent-border bg-accent-muted text-accent-primary'
                : 'border-surface-border bg-surface-overlay text-text-primary hover:bg-surface-hover'
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}
