import { useState, useEffect } from 'react';
import { useUiStore } from '../store/uiStore';
import type { Mode } from '../../types';

const MODES: Mode[] = ['Understand', 'Plan'];

/**
 * Command palette for quick mode switching and actions.
 * Triggered with Cmd+K or Ctrl+K.
 */
export function CommandPalette(): JSX.Element {
  const { commandPaletteOpen, setCommandPaletteOpen, activeMode, setMode } = useUiStore();
  const [input, setInput] = useState('');

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
        setInput('');
      }
      if (commandPaletteOpen && e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setInput('');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return <></>;

  const filtered = MODES.filter((mode) => mode.toLowerCase().includes(input.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-32">
      <div className="w-96 rounded-lg border border-ana-border bg-ana-panel shadow-2xl">
        {/* Input */}
        <div className="border-b border-ana-border px-4 py-3">
          <input
            autoFocus
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Switch mode or search…"
            className="w-full bg-transparent text-sm text-ana-text outline-none placeholder:text-ana-text-muted"
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-ana-text-muted">No matches found</div>
          ) : (
            filtered.map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setMode(mode);
                  setCommandPaletteOpen(false);
                  setInput('');
                }}
                className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                  mode === activeMode
                    ? 'bg-ana-hover text-ana-accent'
                    : 'text-ana-text hover:bg-ana-hover'
                }`}
              >
                <div className="font-medium">{mode}</div>
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-ana-border px-4 py-2 text-xs text-ana-text-muted">
          Press ESC to close
        </div>
      </div>
    </div>
  );
}
