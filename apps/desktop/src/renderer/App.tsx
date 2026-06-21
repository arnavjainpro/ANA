import { useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import { ConnectPanel } from './components/ConnectPanel';
import { FileTree } from './components/FileTree';
import { AnaConversation } from './components/AnaConversation';
import { Composer } from './components/Composer';
import { FileViewer } from './components/FileViewer';
import { CommandPalette } from './components/CommandPalette';
import { DiagramPanel } from './panels/understand/DiagramPanel';
import { WhiteboardPanel } from './panels/plan/WhiteboardPanel';
import { useUiStore } from './store/uiStore';
import { useRepoStore } from './store/repoStore';
import { useConversationStore } from './store/conversationStore';
import { isIpcError } from './lib/ipc';

export default function App(): JSX.Element {
  const activeMode = useUiStore((s) => s.activeMode);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const { setConnected, setRepos } = useRepoStore();
  const error = useConversationStore((s) => s.error);
  const repoError = useRepoStore((s) => s.error);
  const { openFiles } = useUiStore();
  
  const [centerWidth, setCenterWidth] = useState(40);
  const [dragging, setDragging] = useState(false);

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
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      
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
          <aside className="w-80 flex flex-col border-r border-ana-border bg-ana-panel overflow-hidden flex-shrink-0">
            <ConnectPanel />
            <div className="flex-1 overflow-auto">
              <FileTree />
            </div>
          </aside>
        )}

        <section
          className="flex flex-col bg-ana-panel border-r border-ana-border overflow-hidden"
          style={{ width: `${centerWidth}%` }}
        >
          <div className="flex-1 min-h-0 overflow-hidden">
            <AnaConversation />
          </div>
          <Composer />
        </section>

        <div
          onMouseDown={handleMouseDown}
          className={`w-1 bg-ana-border hover:bg-ana-accent/50 cursor-col-resize transition-colors ${
            dragging ? 'bg-ana-accent/50' : ''
          }`}
        />

        <section className="flex-1 min-h-0 overflow-hidden bg-ana-bg">
          {activeMode === 'Plan' ? <WhiteboardPanel /> : <DiagramPanel />}
        </section>

        {openFiles.length > 0 && (
          <>
            <div className="w-1 bg-ana-border" />
            <aside className="w-80 flex-shrink-0 border-l border-ana-border bg-ana-panel overflow-hidden">
              <FileViewer />
            </aside>
          </>
        )}
      </div>

      {(error || repoError) && (
        <div className="border-t border-red-900/30 bg-red-950/20 px-4 py-2 text-sm text-red-400">
          {error ?? repoError}
        </div>
      )}

      <CommandPalette />
    </div>
  );
}
