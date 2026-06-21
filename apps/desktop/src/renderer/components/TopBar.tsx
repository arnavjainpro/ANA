import { useUiStore } from '../store/uiStore';
import { useRepoStore } from '../store/repoStore';
import type { Mode } from '../../types';

const MODES: Mode[] = ['Understand', 'Plan'];

export function TopBar(): JSX.Element {
  const activeMode = useUiStore((s) => s.activeMode);
  const setMode = useUiStore((s) => s.setMode);
  const connected = useRepoStore((s) => s.connected);
  const login = useRepoStore((s) => s.login);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);

  return (
    <header className="flex items-center justify-between border-b border-ana-border bg-ana-panel px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="text-lg font-semibold tracking-tight">Ana</span>
        {selectedRepo && (
          <span className="text-sm text-gray-400">{selectedRepo.full_name}</span>
        )}
      </div>

      <div className="flex items-center gap-1 rounded-lg bg-ana-bg p-1">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setMode(mode)}
            className={
              mode === activeMode
                ? 'rounded-md bg-ana-accent px-4 py-1 text-sm font-medium text-white'
                : 'rounded-md px-4 py-1 text-sm font-medium text-gray-400 hover:text-gray-200'
            }
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="text-sm text-gray-400">
        {connected ? `@${login ?? 'connected'}` : 'Not connected'}
      </div>
    </header>
  );
}
