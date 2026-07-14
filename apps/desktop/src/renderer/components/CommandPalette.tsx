import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { Search, Lightbulb, ClipboardList, Hammer } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { Kbd } from './ui';
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
    icon: <Lightbulb size={16} strokeWidth={1.75} aria-hidden />,
  },
  {
    mode: 'Plan',
    hint: 'Turn an idea into stories and tasks',
    icon: <ClipboardList size={16} strokeWidth={1.75} aria-hidden />,
  },
  {
    mode: 'Build',
    hint: 'Let Ana write changes to your local copy',
    icon: <Hammer size={16} strokeWidth={1.75} aria-hidden />,
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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-32 backdrop-blur-sm"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-[28rem] animate-scale-in overflow-hidden rounded-xl border border-surface-border bg-surface-modal shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 border-b border-surface-border px-4 py-3">
          <Search size={16} strokeWidth={1.75} aria-hidden className="flex-shrink-0 text-text-tertiary" />
          <input
            autoFocus
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Switch mode…"
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-text-secondary">No matches found</div>
          ) : (
            filtered.map((cmd, i) => {
              const isHighlighted = i === highlight;
              const isActive = cmd.mode === activeMode;
              return (
                <button
                  key={cmd.mode}
                  onClick={() => select(cmd.mode)}
                  onMouseMove={() => setHighlight(i)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-100 ${
                    isHighlighted ? 'bg-surface-hover' : ''
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${
                      isHighlighted ? 'text-accent-primary' : 'text-text-secondary'
                    }`}
                  >
                    {cmd.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text-primary">{cmd.mode}</span>
                    <span className="block truncate text-xs text-text-secondary">{cmd.hint}</span>
                  </span>
                  {isActive && (
                    <span className="flex-shrink-0 rounded-md bg-accent-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-primary">
                      Active
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-surface-border px-4 py-2 text-xs text-text-tertiary">
          <span className="flex items-center gap-1.5">
            <Kbd>↑↓</Kbd>
            to navigate
            <span className="ml-1.5" />
            <Kbd>↵</Kbd>
            to select
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  );
}
