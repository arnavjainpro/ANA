import { ChevronLeft, Maximize2 } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import type { Mode } from '../../types';

const MODES: Mode[] = ['Understand', 'Plan', 'Build'];

// In popup mode macOS window buttons are hidden entirely, but the Windows/Linux
// overlay controls can't be removed — leave room for them on the right.
const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

/**
 * Slim drag-strip chrome for the floating popup: brand mark, compact mode tabs
 * (only while the workspace flyout is open), expand/collapse, and return-to-full.
 */
export function PopupHeader(): JSX.Element {
  const activeMode = useUiStore((s) => s.activeMode);
  const setMode = useUiStore((s) => s.setMode);
  const popupExpanded = useUiStore((s) => s.popupExpanded);

  const btn =
    'app-no-drag flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary active:bg-surface-active';

  return (
    <header
      role="banner"
      className={`app-drag flex h-8 flex-shrink-0 items-center justify-between gap-2 border-b border-surface-border bg-surface-raised pl-3 ${
        IS_MAC ? 'pr-2' : 'pr-[140px]'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
        <span className="text-xs font-semibold tracking-tight text-text-primary">Ana</span>
      </div>

      {popupExpanded && (
        <div role="tablist" aria-label="Conversation mode" className="app-no-drag flex items-center gap-0.5">
          {MODES.map((mode) => {
            const selected = mode === activeMode;
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="ana-workspace"
                onClick={() => setMode(mode)}
                className={`cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium transition-colors duration-150 ${
                  selected
                    ? 'bg-accent-muted text-accent-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {mode}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void window.ana.window.setPopupExpanded(!popupExpanded)}
          aria-label={popupExpanded ? 'Close workspace' : 'Open workspace'}
          aria-expanded={popupExpanded}
          title={popupExpanded ? 'Close workspace' : 'Open workspace'}
          className={btn}
        >
          <ChevronLeft
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className={`transition-transform duration-150 ${popupExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        <button
          type="button"
          onClick={() => void window.ana.window.setMode('full')}
          aria-label="Return to full window"
          title="Return to full window (Cmd/Ctrl+Shift+A)"
          className={btn}
        >
          <Maximize2 size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </header>
  );
}
