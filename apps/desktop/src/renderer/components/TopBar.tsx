import { useUiStore } from '../store/uiStore';
import { useRepoStore } from '../store/repoStore';
import type { Mode } from '../../types';

const MODES: Mode[] = ['Understand', 'Plan', 'Build'];

/** Short helper copy under each mode, surfaced as a tooltip on the tab. */
const MODE_HINT: Record<Mode, string> = {
  Understand: 'Explore and explain the codebase',
  Plan: 'Turn an idea into stories and tasks',
  Build: 'Let Ana write changes to your local copy',
};

// Frameless window: leave room for the OS window controls. macOS traffic lights
// sit top-left; Windows/Linux overlay controls sit top-right.
const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

export function TopBar(): JSX.Element {
  const activeMode = useUiStore((s) => s.activeMode);
  const setMode = useUiStore((s) => s.setMode);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const connected = useRepoStore((s) => s.connected);
  const login = useRepoStore((s) => s.login);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);

  const activeIndex = Math.max(0, MODES.indexOf(activeMode));

  return (
    <header
      role="banner"
      className={`app-drag relative flex h-12 items-center justify-between border-b border-ana-border bg-ana-panel ${
        IS_MAC ? 'pl-[78px] pr-3' : 'pl-3 pr-[140px]'
      }`}
    >
      {/* Left: sidebar toggle + brand mark + repo */}
      <div className="flex flex-1 items-center gap-2.5">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="app-no-drag flex h-7 w-7 items-center justify-center rounded-md text-ana-text-muted transition-colors duration-150 hover:bg-ana-hover hover:text-ana-text"
          aria-label="Toggle sidebar"
          aria-pressed={sidebarOpen}
          title="Toggle sidebar"
        >
          <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ana-brand" />
          <span className="text-sm font-semibold tracking-tight text-ana-text">Ana</span>
        </div>

        {selectedRepo && (
          <>
            <span aria-hidden="true" className="h-3.5 w-px bg-ana-border" />
            <div className="flex min-w-0 items-center gap-1.5 text-ana-text-muted">
              <svg aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              <span className="truncate text-xs font-medium">{selectedRepo.full_name}</span>
            </div>
          </>
        )}
      </div>

      {/* Center: segmented mode switcher with a flat sliding indicator. A
          3-column grid keeps every slot equal width so the indicator lands
          exactly under its label regardless of label length. */}
      <div
        role="tablist"
        aria-label="Conversation mode"
        className="app-no-drag relative grid grid-cols-3 rounded-lg border border-ana-border bg-ana-bg p-0.5"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-md bg-ana-brand transition-transform duration-200 ease-out"
          style={{
            width: `calc((100% - 0.25rem) / ${MODES.length})`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
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
              title={MODE_HINT[mode]}
              className={`relative z-10 rounded-md px-4 py-1 text-center text-xs font-medium transition-colors duration-150 ${
                selected ? 'text-white' : 'text-ana-text-muted hover:text-ana-text'
              }`}
            >
              {mode}
            </button>
          );
        })}
      </div>

      {/* Right: command palette + connection status */}
      <div className="flex flex-1 items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="app-no-drag flex items-center gap-1.5 rounded-md border border-ana-border px-2 py-1 text-xs text-ana-text-muted transition-colors duration-150 hover:bg-ana-hover hover:text-ana-text"
          aria-label="Open command palette"
          title="Open command palette (Cmd+K)"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <kbd className="font-sans text-[11px] font-medium tracking-wide">{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>
        </button>

        <div
          className="flex items-center gap-1.5 text-xs text-ana-text-muted"
          title={connected ? 'Connected to GitHub' : 'Not connected'}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-ana-text-muted/50'}`}
          />
          <span className="font-medium">{connected ? `@${login ?? 'connected'}` : 'Not connected'}</span>
        </div>
      </div>
    </header>
  );
}
