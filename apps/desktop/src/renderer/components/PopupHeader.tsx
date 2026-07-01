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
    'app-no-drag flex h-6 w-6 items-center justify-center rounded-md text-ana-text-muted transition-colors duration-150 hover:bg-ana-hover hover:text-ana-text';

  return (
    <header
      role="banner"
      className={`app-drag flex h-8 flex-shrink-0 items-center justify-between gap-2 border-b border-ana-border bg-ana-panel pl-3 ${
        IS_MAC ? 'pr-2' : 'pr-[140px]'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ana-brand" />
        <span className="text-xs font-semibold tracking-tight text-ana-text">Ana</span>
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
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors duration-150 ${
                  selected ? 'bg-ana-brand text-white' : 'text-ana-text-muted hover:text-ana-text'
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
          <svg
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform duration-150 ${popupExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => void window.ana.window.setMode('full')}
          aria-label="Return to full window"
          title="Return to full window (Cmd/Ctrl+Shift+A)"
          className={btn}
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
