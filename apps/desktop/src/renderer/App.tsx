import { useEffect } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
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

      {/* Main Content Area with Resizable Panels */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Sidebar: File tree & repo browser (collapsible) */}
        {sidebarOpen && (
          <>
            <aside className="flex w-80 flex-col border-r border-ana-border bg-ana-panel overflow-hidden">
              <ConnectPanel />
              <div className="min-h-0 flex-1 overflow-auto">
                <FileTree />
              </div>
            </aside>
            <PanelResizeHandle className="w-1 bg-ana-border hover:bg-ana-accent/50 transition-colors cursor-col-resize" />
          </>
        )}

        {/* Main Content Panels: Ana + Right Workspace */}
        <PanelGroup direction="horizontal" className="flex-1">
          {/* Center: Ana conversation + composer */}
          <Panel defaultSize={35} minSize={20} maxSize={70}>
            <section className="flex h-full flex-col bg-ana-panel border-r border-ana-border">
              <div className="min-h-0 flex-1 overflow-hidden">
                <AnaConversation />
              </div>
              <Composer />
            </section>
          </Panel>

          <PanelResizeHandle className="w-1 bg-ana-border hover:bg-ana-accent/50 transition-colors cursor-col-resize" />

          {/* Right: Dynamic workspace (Diagram or Whiteboard) */}
          <Panel defaultSize={65} minSize={20}>
            <section className="min-w-0 h-full overflow-hidden bg-ana-bg">
              {activeMode === 'Plan' ? <WhiteboardPanel /> : <DiagramPanel />}
            </section>
          </Panel>
        </PanelGroup>
      </div>

      {/* File Viewer Side Pane */}
      {openFiles.length > 0 && (
        <>
          <div className="w-1 bg-ana-border" />
          <aside className="w-80 flex-shrink-0 border-l border-ana-border bg-ana-panel overflow-hidden">
            <FileViewer />
          </aside>
        </>
      )}

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
