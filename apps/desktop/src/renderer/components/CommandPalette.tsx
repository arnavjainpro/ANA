import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useUiStore } from '../store/uiStore';
import type { Mode } from '../../types';

interface ModeCommand {
  mode: Mode;
  hint: string;
  icon: ReactNode;
}

const MODE_COMMANDS: ModeCommand[] = [
  {
    mode: 'Understand',
    hint: 'Explore and explain the codebase',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    ),
  },
  {
    mode: 'Plan',
    hint: 'Turn an idea into stories and tasks',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    ),
  },
  {
    mode: 'Build',
    hint: 'Let Ana write changes to your local copy',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    ),
  },
];

/**
 * Command palette for quick mode switching. Triggered with Cmd+K / Ctrl+K.
 * Supports type-to-filter plus arrow-key navigation and Enter to select.
 */
export function CommandPalette(): JSX.Element {
  const { commandPaletteOpen, setCommandPaletteOpen, activeMode, setMode } = useUiStore();
  const [input, setInput] = useState('');
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(
    () => MODE_COMMANDS.filter((c) => c.mode.toLowerCase().includes(input.toLowerCase())),
    [input],
  );

  // Keep the highlight in range whenever the filtered set changes.
  useEffect(() => {
    setHighlight(0);
  }, [input]);

  // Reset transient state each time the palette opens.
  useEffect(() => {
    if (commandPaletteOpen) {
      setInput('');
      setHighlight(0);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (commandPaletteOpen && e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return <></>;

  const select = (mode: Mode): void => {
    setMode(mode);
    setCommandPaletteOpen(false);
  };

  const onInputKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (filtered.length ? (h + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (filtered.length ? (h - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const choice = filtered[highlight];
      if (choice) select(choice.mode);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-32 backdrop-blur-sm"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-[28rem] animate-scale-in overflow-hidden rounded-xl border border-ana-border bg-ana-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 border-b border-ana-border px-4 py-3">
          <svg aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-ana-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            autoFocus
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Switch mode…"
            className="w-full bg-transparent text-sm text-ana-text outline-none placeholder:text-ana-text-muted"
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-ana-text-muted">No matches found</div>
          ) : (
            filtered.map((cmd, i) => {
              const isHighlighted = i === highlight;
              const isActive = cmd.mode === activeMode;
              return (
                <button
                  key={cmd.mode}
                  onClick={() => select(cmd.mode)}
                  onMouseMove={() => setHighlight(i)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-100 ${
                    isHighlighted ? 'bg-ana-brand-soft' : 'hover:bg-ana-hover'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${
                      isHighlighted ? 'text-ana-brand' : 'text-ana-text-muted'
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {cmd.icon}
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ana-text">{cmd.mode}</span>
                    <span className="block truncate text-xs text-ana-text-muted">{cmd.hint}</span>
                  </span>
                  {isActive && (
                    <span className="flex-shrink-0 rounded-md bg-ana-brand-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ana-brand">
                      Active
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-ana-border px-4 py-2 text-[11px] text-ana-text-muted">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-ana-border bg-ana-bg px-1.5 py-0.5 font-sans">↑↓</kbd>
            to navigate
            <kbd className="ml-2 rounded border border-ana-border bg-ana-bg px-1.5 py-0.5 font-sans">↵</kbd>
            to select
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-ana-border bg-ana-bg px-1.5 py-0.5 font-sans">esc</kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  );
}
