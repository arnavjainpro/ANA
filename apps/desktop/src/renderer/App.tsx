import { useEffect, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { ConnectPanel } from './components/ConnectPanel';
import { FileTreeSection } from './components/FileTreeSection';
import { AnaConversation } from './components/AnaConversation';
import { Composer } from './components/Composer';
import { CommandPalette } from './components/CommandPalette';
import { IndexingProgress } from './components/IndexingProgress';
import { RefreshContext } from './components/RefreshContext';
import { WorkspaceContent } from './components/WorkspaceContent';
import { useUiStore } from './store/uiStore';
import { useRepoStore } from './store/repoStore';
import { useConversationStore } from './store/conversationStore';
import { useBuildStore } from './store/buildStore';
import { isIpcError } from './lib/ipc';

export default function App(): JSX.Element {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const isPanelLoading = useUiStore((s) => s.isPanelLoading);
  const setActiveMode = useUiStore((s) => s.setActiveMode);
  const setPanelLoading = useUiStore((s) => s.setPanelLoading);
  const applyPanel = useConversationStore((s) => s.applyPanel);
  const { setConnected, setRepos } = useRepoStore();
  const error = useConversationStore((s) => s.error);
  const sessionStarting = useConversationStore((s) => s.sessionStarting);
  const repoError = useRepoStore((s) => s.error);

  const [centerWidth, setCenterWidth] = useState(40);
  const [dragging, setDragging] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const anaPaneRef = useRef<HTMLElement>(null);
  const activeError = error ?? repoError;

  // Move focus to the error message whenever one appears (OAuth / index errors).
  useEffect(() => {
    if (activeError) errorRef.current?.focus();
  }, [activeError]);

  // Clear the Build undo stack when the app closes (session end).
  useEffect(() => {
    const handler = (): void => useBuildStore.getState().endSession();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Voice (Tavus) turns render their diagram/whiteboard via a pushed event,
  // since they never pass through the renderer's text-turn path.
  useEffect(() => {
    const unsubscribe = window.ana.conversation.onPanelUpdate((evt) => {
      setActiveMode(evt.mode);
      applyPanel(evt);
      setPanelLoading(false);
    });
    return unsubscribe;
  }, [applyPanel, setActiveMode, setPanelLoading]);

  // Fresh launch: drop any active repo the backend remembered from a previous
  // session so Ana doesn't answer from a project not selected this session.
  useEffect(() => {
    void window.ana.conversation.resetContext();
  }, []);

  useEffect(() => {
    void (async () => {
      const status = await window.ana.auth.status();
      if (status.connected) {
        setConnected(true, status.login);
        const repos = await window.ana.repo.list();
        if (!isIpcError(repos)) setRepos(repos.repos);
      }
    })();
  }, [setConnected, setRepos]);

  const handleMouseDown = () => {
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById('main-content');
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      // Measure from the Ana pane's own left edge, not the container's: the
      // container includes the fixed left sidebar (and the right file viewer),
      // so using the container left over-counts the sidebar width and slams the
      // pane to the clamp. The pane's actual left edge already accounts for it.
      const anaLeft = anaPaneRef.current?.getBoundingClientRect().left ?? rect.left;
      const newWidth = ((e.clientX - anaLeft) / rect.width) * 100;

      if (newWidth > 20 && newWidth < 80) {
        setCenterWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  return (
    <div className="flex h-screen w-screen flex-col bg-ana-bg text-ana-text">
      <TopBar />

      <div id="main-content" className="flex flex-1 min-h-0 overflow-hidden">
        {sidebarOpen && (
          <aside
            aria-label="Repository"
            className="w-80 flex flex-col border-r border-ana-border bg-ana-panel overflow-hidden flex-shrink-0"
          >
            <ConnectPanel />
            <FileTreeSection />
          </aside>
        )}

        <aside
          ref={anaPaneRef}
          aria-label="Ana"
          aria-busy={sessionStarting}
          className="flex flex-col bg-ana-panel border-r border-ana-border overflow-hidden"
          style={{ width: `${centerWidth}%` }}
        >
          <RefreshContext />
          <div className="flex-1 min-h-0 overflow-hidden">
            <AnaConversation />
          </div>
          <Composer />
        </aside>

        <div
          aria-hidden="true"
          onMouseDown={handleMouseDown}
          className={`w-1 cursor-col-resize bg-ana-border transition-colors hover:bg-ana-brand ${
            dragging ? 'bg-ana-brand' : ''
          }`}
        />

        <main
          id="ana-workspace"
          aria-label="Workspace"
          aria-busy={isPanelLoading}
          className="relative flex-1 min-h-0 overflow-hidden bg-ana-bg"
        >
          <IndexingProgress />
          <WorkspaceContent />
        </main>
      </div>

      {activeError && (
        <div
          ref={errorRef}
          tabIndex={-1}
          aria-live="polite"
          className="border-t border-red-900/30 bg-red-950/20 px-4 py-2 text-sm text-red-400"
        >
          {activeError}
        </div>
      )}

      <CommandPalette />
    </div>
  );
}
