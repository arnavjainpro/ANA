import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { ConnectPanel } from './components/ConnectPanel';
import { FileTree } from './components/FileTree';
import { AnaConversation } from './components/AnaConversation';
import { Composer } from './components/Composer';
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
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const { setConnected, setRepos } = useRepoStore();
  const error = useConversationStore((s) => s.error);
  const repoError = useRepoStore((s) => s.error);

  // Restore an existing GitHub session on launch.
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

  return (
    <div className="flex h-screen w-screen flex-col bg-ana-bg text-ana-text">
      {/* Top Bar */}
      <TopBar />

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Sidebar: File tree & repo browser (collapsible) */}
        <aside
          className={`flex flex-col border-r border-ana-border bg-ana-panel transition-all duration-200 overflow-hidden ${
            sidebarOpen ? '' : 'w-0'
          }`}
          style={{ width: sidebarOpen ? `${sidebarWidth}px` : '0' }}
        >
          <ConnectPanel />
          <div className="min-h-0 flex-1 overflow-auto">
            <FileTree />
          </div>
        </aside>

        {/* Center: Ana conversation + composer */}
        <section className="flex w-80 min-w-[320px] flex-col border-r border-ana-border bg-ana-panel">
          <div className="min-h-0 flex-1">
            <AnaConversation />
          </div>
          <Composer />
        </section>

        {/* Right Panel: Dynamic workspace (Diagram or Whiteboard) */}
        <section className="min-w-0 flex-1 overflow-hidden bg-ana-bg">
          {activeMode === 'Plan' ? <WhiteboardPanel /> : <DiagramPanel />}
        </section>
      </div>

      {/* Error banner */}
      {(error || repoError) && (
        <div className="border-t border-red-900/30 bg-red-950/20 px-4 py-2 text-sm text-red-400">
          {error ?? repoError}
        </div>
      )}

      {/* Command Palette */}
      <CommandPalette />
    </div>
  );
}
