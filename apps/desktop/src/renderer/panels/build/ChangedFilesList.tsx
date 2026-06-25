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
    <div className="flex items-center gap-2 overflow-x-auto border-b border-ana-border bg-ana-panel px-3 py-2">
      <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-ana-text-muted">
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
            className={`flex-shrink-0 rounded px-2 py-1 font-mono text-xs transition-colors ${
              isActive
                ? 'bg-ana-accent text-ana-bg'
                : 'bg-ana-bg text-ana-text hover:bg-ana-hover'
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}
