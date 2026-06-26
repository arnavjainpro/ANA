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
      <span className="flex flex-shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ana-text-muted">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-400" />
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
            className={`flex-shrink-0 rounded-md border px-2.5 py-1 font-mono text-xs transition-colors duration-150 ${
              isActive
                ? 'border-ana-brand bg-ana-brand text-white'
                : 'border-ana-border bg-ana-bg text-ana-text hover:bg-ana-hover'
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}
