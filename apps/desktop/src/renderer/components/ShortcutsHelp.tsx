import { useEffect } from 'react';
import { useUiStore } from '../store/uiStore';
import { Kbd } from './ui';

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl';

interface Shortcut {
  label: string;
  keys: string[];
}

const SHORTCUTS: Shortcut[] = [
  { label: 'Command palette', keys: [`${MOD}K`] },
  { label: 'Understand mode', keys: [`${MOD}1`] },
  { label: 'Plan mode', keys: [`${MOD}2`] },
  { label: 'Build mode', keys: [`${MOD}3`] },
  { label: 'Toggle terminal', keys: [IS_MAC ? '⌘`' : 'Ctrl+`'] },
  { label: 'Pop out Ana', keys: [`${MOD}⇧A`] },
  { label: 'Keyboard shortcuts', keys: ['?'] },
];

/**
 * A small cheatsheet of the app's keyboard shortcuts. Opened with `?` or from
 * the command palette; closes on Esc or backdrop click. Mirrors the overlay
 * pattern used by CommandPalette.
 */
export function ShortcutsHelp(): JSX.Element {
  const shortcutsOpen = useUiStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);

  useEffect(() => {
    if (!shortcutsOpen) return undefined;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setShortcutsOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcutsOpen, setShortcutsOpen]);

  if (!shortcutsOpen) return <></>;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-32 backdrop-blur-sm"
      onClick={() => setShortcutsOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="w-[24rem] animate-scale-in overflow-hidden rounded-xl border border-surface-border bg-surface-modal shadow-modal ease-emphasized"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Keyboard shortcuts</h2>
        </div>
        <ul className="flex flex-col p-1.5">
          {SHORTCUTS.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-text-secondary"
            >
              <span>{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
