import { PanelLeft, SquareTerminal, PictureInPicture2, Search } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useRepoStore } from '../store/repoStore';
import { GithubIcon, Kbd } from './ui';
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
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const toggleTerminal = useUiStore((s) => s.toggleTerminal);
  const connected = useRepoStore((s) => s.connected);
  const login = useRepoStore((s) => s.login);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);

  const activeIndex = Math.max(0, MODES.indexOf(activeMode));

  // IconButton isn't reused here: TopBar buttons need the app-no-drag opt-out
  // baked into every interactive element inside the drag strip.
  const iconBtn =
    'app-no-drag flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary active:bg-surface-active';

  return (
    <header
      role="banner"
      className={`app-drag relative flex h-12 items-center justify-between border-b border-surface-border bg-surface-raised ${
        IS_MAC ? 'pl-[78px] pr-3' : 'pl-3 pr-[140px]'
      }`}
    >
      {/* Left: sidebar toggle + brand mark + repo */}
      <div className="flex flex-1 items-center gap-2.5">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`${iconBtn} ${sidebarOpen ? 'text-text-secondary' : 'text-text-tertiary'}`}
          aria-label="Toggle sidebar"
          aria-pressed={sidebarOpen}
          title="Toggle sidebar"
        >
          <PanelLeft size={16} strokeWidth={1.75} aria-hidden />
        </button>

        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent-primary" />
          <span className="text-sm font-semibold tracking-tight text-text-primary">Ana</span>
        </div>

        {selectedRepo && (
          <>
            <span aria-hidden="true" className="h-3.5 w-px bg-surface-border" />
            <div className="flex min-w-0 items-center gap-1.5 text-text-secondary">
              <span className="flex-shrink-0">
                <GithubIcon size={14} />
              </span>
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
        className="app-no-drag relative grid grid-cols-3 rounded-lg border border-surface-border bg-surface-base p-0.5"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-md bg-surface-active shadow-raised transition-transform duration-[250ms] ease-emphasized"
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
              className={`relative z-10 cursor-pointer rounded-md px-4 py-1 text-center text-xs font-medium transition-colors duration-150 ${
                selected ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {mode}
            </button>
          );
        })}
      </div>

      {/* Right: terminal + pop-out + command palette + connection status */}
      <div className="flex flex-1 items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={toggleTerminal}
          className={`${iconBtn} ${terminalOpen ? 'text-accent-primary' : 'text-text-secondary'}`}
          aria-label="Toggle terminal"
          aria-pressed={terminalOpen}
          title={`Toggle terminal (${IS_MAC ? '⌘`' : 'Ctrl+`'})`}
        >
          <SquareTerminal size={16} strokeWidth={1.75} aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => void window.ana.window.setMode('popup')}
          className={`${iconBtn} text-text-secondary`}
          aria-label="Pop out Ana"
          title={`Pop out Ana (${IS_MAC ? '⌘⇧A' : 'Ctrl+Shift+A'})`}
        >
          <PictureInPicture2 size={16} strokeWidth={1.75} aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="app-no-drag flex cursor-pointer items-center gap-1.5 rounded-md border border-surface-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary active:bg-surface-active"
          aria-label="Open command palette"
          title="Open command palette (Cmd+K)"
        >
          <Search size={14} strokeWidth={1.75} aria-hidden />
          <Kbd>{IS_MAC ? '⌘K' : 'Ctrl K'}</Kbd>
        </button>

        <div
          className="flex items-center gap-1.5 text-xs text-text-secondary"
          title={connected ? 'Connected to GitHub' : 'Not connected'}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-status-success' : 'bg-text-tertiary/50'}`}
          />
          <span className="font-medium">{connected ? `@${login ?? 'connected'}` : 'Not connected'}</span>
        </div>
      </div>
    </header>
  );
}
