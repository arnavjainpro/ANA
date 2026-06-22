import { useUiStore } from '../store/uiStore';
import { useRepoStore } from '../store/repoStore';
import type { Mode } from '../../types';

const MODES: Mode[] = ['Understand', 'Plan', 'Build'];

export function TopBar(): JSX.Element {
  const activeMode = useUiStore((s) => s.activeMode);
  const setMode = useUiStore((s) => s.setMode);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const connected = useRepoStore((s) => s.connected);
  const login = useRepoStore((s) => s.login);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);

  return (
    <header
      role="banner"
      className="flex items-center justify-between border-b border-ana-border bg-ana-panel px-4 py-3 h-12"
    >
      {/* Left: Sidebar toggle + Ana logo + repo name */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1 hover:bg-ana-hover rounded transition-colors text-ana-text-muted hover:text-ana-text"
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-lg font-semibold text-ana-text tracking-tight">Ana</span>
        {selectedRepo && (
          <span className="text-sm text-ana-text-muted">{selectedRepo.full_name}</span>
        )}
      </div>

      {/* Center: Mode switcher (ARIA tabs controlling the workspace panel) */}
      <div role="tablist" aria-label="Conversation mode" className="flex items-center gap-2">
        {MODES.map((mode) => {
          const selected = mode === activeMode;
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              id={`mode-tab-${mode}`}
              aria-selected={selected}
              aria-controls="ana-workspace"
              onClick={() => setMode(mode)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors duration-100 ease-in-out ${
                selected
                  ? 'bg-ana-accent text-ana-bg'
                  : 'text-ana-text-muted hover:text-ana-text hover:bg-ana-hover'
              }`}
            >
              {mode}
            </button>
          );
        })}
      </div>

      {/* Right: Command palette + Status */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="px-2 py-1 rounded text-xs text-ana-text-muted hover:text-ana-text hover:bg-ana-hover transition-colors flex items-center gap-1"
          aria-label="Open command palette"
          title="Open command palette (Cmd+K)"
        >
          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>Cmd+K</span>
        </button>
        <div className="text-xs text-ana-text-muted">
          {connected ? `@${login ?? 'connected'}` : 'Not connected'}
        </div>
      </div>
    </header>
  );
}
