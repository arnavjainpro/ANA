import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  Search,
  Lightbulb,
  ClipboardList,
  Hammer,
  SquareTerminal,
  PanelLeft,
  MessageSquare,
  PictureInPicture2,
  Sun,
  Moon,
  Settings,
  Keyboard,
} from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { Kbd } from './ui';
import type { Mode } from '../../types';

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl';

type Group = 'Modes' | 'View' | 'Workspace';

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: ReactNode;
  group: Group;
  keywords: string;
  shortcut?: string;
  /** Marks the current mode with an "Active" badge. */
  activeMode?: Mode;
  run: () => void;
}

const GROUP_ORDER: Group[] = ['Modes', 'View', 'Workspace'];

/**
 * Action palette (Cmd+K): switch modes and run the app actions a user reaches
 * for — toggle terminal/sidebar/composer, pop out, switch theme, open Settings.
 * Type-to-filter across label + keywords, arrow-key navigation, Enter to run.
 */
export function CommandPalette(): JSX.Element {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    activeMode,
    setMode,
    toggleTerminal,
    sidebarOpen,
    setSidebarOpen,
    toggleComposer,
    setSettingsOpen,
    setShortcutsOpen,
    theme,
    setTheme,
  } = useUiStore();
  const [input, setInput] = useState('');
  const [highlight, setHighlight] = useState(0);

  const close = (): void => setCommandPaletteOpen(false);

  const commands = useMemo<Command[]>(
    () => [
      {
        id: 'mode-understand',
        label: 'Understand',
        hint: 'Explore and explain the codebase',
        icon: <Lightbulb size={16} strokeWidth={1.75} aria-hidden />,
        group: 'Modes',
        keywords: 'understand explore explain diagram',
        shortcut: `${MOD}1`,
        activeMode: 'Understand',
        run: () => setMode('Understand'),
      },
      {
        id: 'mode-plan',
        label: 'Plan',
        hint: 'Turn an idea into stories and tasks',
        icon: <ClipboardList size={16} strokeWidth={1.75} aria-hidden />,
        group: 'Modes',
        keywords: 'plan stories tasks whiteboard',
        shortcut: `${MOD}2`,
        activeMode: 'Plan',
        run: () => setMode('Plan'),
      },
      {
        id: 'mode-build',
        label: 'Build',
        hint: 'Let Ana write changes to your local copy',
        icon: <Hammer size={16} strokeWidth={1.75} aria-hidden />,
        group: 'Modes',
        keywords: 'build code edit changes patch',
        shortcut: `${MOD}3`,
        activeMode: 'Build',
        run: () => setMode('Build'),
      },
      {
        id: 'toggle-terminal',
        label: 'Toggle terminal',
        hint: 'Show or hide the integrated terminal',
        icon: <SquareTerminal size={16} strokeWidth={1.75} aria-hidden />,
        group: 'View',
        keywords: 'terminal shell console command',
        shortcut: IS_MAC ? '⌘`' : 'Ctrl+`',
        run: toggleTerminal,
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle sidebar',
        hint: 'Show or hide the repository sidebar',
        icon: <PanelLeft size={16} strokeWidth={1.75} aria-hidden />,
        group: 'View',
        keywords: 'sidebar files repo tree',
        run: () => setSidebarOpen(!sidebarOpen),
      },
      {
        id: 'toggle-composer',
        label: 'Toggle text composer',
        hint: 'Type to Ana instead of speaking',
        icon: <MessageSquare size={16} strokeWidth={1.75} aria-hidden />,
        group: 'View',
        keywords: 'composer type text message input',
        run: toggleComposer,
      },
      {
        id: 'pop-out',
        label: 'Pop out Ana',
        hint: 'Float Ana in a compact window',
        icon: <PictureInPicture2 size={16} strokeWidth={1.75} aria-hidden />,
        group: 'View',
        keywords: 'popup float pip picture window',
        shortcut: `${MOD}⇧A`,
        run: () => void window.ana.window.setMode('popup'),
      },
      {
        id: 'toggle-theme',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        hint: 'Change the app appearance',
        icon:
          theme === 'dark' ? (
            <Sun size={16} strokeWidth={1.75} aria-hidden />
          ) : (
            <Moon size={16} strokeWidth={1.75} aria-hidden />
          ),
        group: 'View',
        keywords: 'theme dark light appearance mode color',
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'open-settings',
        label: 'Open Settings',
        hint: 'Appearance, repositories, and more',
        icon: <Settings size={16} strokeWidth={1.75} aria-hidden />,
        group: 'Workspace',
        keywords: 'settings preferences appearance repos account',
        run: () => setSettingsOpen(true),
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        hint: 'View all keyboard shortcuts',
        icon: <Keyboard size={16} strokeWidth={1.75} aria-hidden />,
        group: 'Workspace',
        keywords: 'keyboard shortcuts keys help',
        shortcut: '?',
        run: () => setShortcutsOpen(true),
      },
    ],
    [
      setMode,
      toggleTerminal,
      sidebarOpen,
      setSidebarOpen,
      toggleComposer,
      setSettingsOpen,
      setShortcutsOpen,
      theme,
      setTheme,
    ],
  );

  const filtered = useMemo(() => {
    const q = input.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q),
    );
  }, [input, commands]);

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

  const run = (cmd: Command): void => {
    cmd.run();
    close();
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
      if (choice) run(choice);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-32 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-[30rem] animate-scale-in overflow-hidden rounded-xl border border-surface-border bg-surface-modal shadow-modal ease-emphasized"
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
            placeholder="Type a command…"
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>

        {/* Results, grouped by section */}
        <div className="max-h-80 overflow-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-text-secondary">No matches found</div>
          ) : (
            GROUP_ORDER.map((group) => {
              const items = filtered.filter((c) => c.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="mb-1 last:mb-0">
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                    {group}
                  </p>
                  {items.map((cmd) => {
                    const flatIndex = filtered.indexOf(cmd);
                    const isHighlighted = flatIndex === highlight;
                    const isActive = cmd.activeMode === activeMode;
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => run(cmd)}
                        onMouseMove={() => setHighlight(flatIndex)}
                        className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-100 ${
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
                          <span className="block text-sm font-medium text-text-primary">{cmd.label}</span>
                          <span className="block truncate text-xs text-text-secondary">{cmd.hint}</span>
                        </span>
                        {isActive && (
                          <span className="flex-shrink-0 rounded-md bg-accent-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-primary">
                            Active
                          </span>
                        )}
                        {cmd.shortcut && !isActive && (
                          <Kbd>{cmd.shortcut}</Kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
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
