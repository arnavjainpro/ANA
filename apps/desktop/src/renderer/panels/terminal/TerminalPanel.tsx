import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { X } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import { useTerminalStore } from '../../store/terminalStore';
import { getXtermTheme } from '../../theme/tokens';

/**
 * A real shell (PTY), same trust boundary as opening Terminal.app — both the
 * user and Ana (via `terminalStore.runCommand`, triggered from voice) can
 * type/execute in it. The xterm instance is created once and the underlying
 * shell process is spawned lazily on first open (via the shared
 * `terminalStore`, so a voice-triggered run reuses the same session), then
 * kept alive for the app's lifetime so scrollback and running processes
 * survive the panel being hidden.
 */
export function TerminalPanel(): JSX.Element {
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const theme = useUiStore((s) => s.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const unsubRef = useRef<(() => void)[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create the xterm instance once — cheap, spawns no process.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"Fira Code", Monaco, monospace',
      fontSize: 12,
      scrollback: 5000,
      theme: getXtermTheme(useUiStore.getState().theme),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    termRef.current = term;
    fitRef.current = fit;

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      const id = sessionIdRef.current;
      if (id) void window.ana.terminal.resize(id, term.cols, term.rows);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      for (const unsub of unsubRef.current) unsub();
      const id = sessionIdRef.current;
      if (id) void window.ana.terminal.kill(id);
      term.dispose();
    };
  }, []);

  // The terminal instance survives theme changes (it's created once and kept
  // alive for the app's lifetime), so re-apply its colors live instead.
  useEffect(() => {
    const term = termRef.current;
    if (term) term.options.theme = getXtermTheme(theme);
  }, [theme]);

  // Lazily spawn the shell the first time the panel is opened.
  useEffect(() => {
    if (!terminalOpen || startedRef.current) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    startedRef.current = true;

    void (async () => {
      const id = await useTerminalStore.getState().ensureSession();
      if (!id) {
        setError(useTerminalStore.getState().error ?? 'Could not start a terminal session.');
        return;
      }
      sessionIdRef.current = id;

      unsubRef.current.push(
        window.ana.terminal.onData((evt) => {
          if (evt.id === id) term.write(evt.data);
        }),
        window.ana.terminal.onExit((evt) => {
          if (evt.id !== id) return;
          term.write(`\r\n\x1b[90m[process exited with code ${evt.exitCode}]\x1b[0m\r\n`);
        }),
        term.onData((data) => {
          void window.ana.terminal.write(id, data);
        }).dispose,
      );

      fit.fit();
      void window.ana.terminal.resize(id, term.cols, term.rows);
      term.focus();
    })();
  }, [terminalOpen]);

  // Re-fit and focus whenever the panel becomes visible again.
  useEffect(() => {
    if (!terminalOpen) return;
    fitRef.current?.fit();
    termRef.current?.focus();
  }, [terminalOpen]);

  const setTerminalOpen = useUiStore((s) => s.setTerminalOpen);

  return (
    <div className="flex h-full flex-col bg-surface-base">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-surface-border bg-surface-raised px-3 py-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">Terminal</span>
        <button
          type="button"
          onClick={() => setTerminalOpen(false)}
          aria-label="Close terminal"
          title="Close terminal (Ctrl+`)"
          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary"
        >
          <X size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {error ? (
        <div className="px-3 py-2 text-xs text-status-danger">{error}</div>
      ) : (
        <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden px-2 py-1" />
      )}
    </div>
  );
}
