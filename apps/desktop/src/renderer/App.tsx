import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { ConnectPanel } from './components/ConnectPanel';
import { FileTree } from './components/FileTree';
import { AnaConversation } from './components/AnaConversation';
import { Composer } from './components/Composer';
import { DiagramPanel } from './panels/understand/DiagramPanel';
import { WhiteboardPanel } from './panels/plan/WhiteboardPanel';
import { useUiStore } from './store/uiStore';
import { useRepoStore } from './store/repoStore';
import { useConversationStore } from './store/conversationStore';
import { isIpcError } from './lib/ipc';

export default function App(): JSX.Element {
  const activeMode = useUiStore((s) => s.activeMode);
  const { setConnected, setRepos } = useRepoStore();
  const error = useConversationStore((s) => s.error);
  const repoError = useRepoStore((s) => s.error);
  const lastSpoken = useConversationStore((s) => s.lastSpoken);

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
    <div className="flex h-full flex-col">
      <TopBar />

      <div className="flex min-h-0 flex-1">
        {/* Sidebar: connect + file tree */}
        <aside className="flex w-72 flex-col border-r border-ana-border bg-ana-panel">
          <ConnectPanel />
          <div className="min-h-0 flex-1 overflow-auto">
            <FileTree />
          </div>
        </aside>

        {/* Left panel: Ana */}
        <section className="flex w-[40%] min-w-[360px] flex-col border-r border-ana-border">
          <div className="min-h-0 flex-1">
            <AnaConversation />
          </div>
          {lastSpoken && (
            <p className="border-t border-ana-border bg-ana-panel px-4 py-2 text-sm text-gray-300">
              {lastSpoken}
            </p>
          )}
          <Composer />
        </section>

        {/* Right panel: Workspace */}
        <section className="min-w-0 flex-1 bg-ana-bg">
          {activeMode === 'Plan' ? <WhiteboardPanel /> : <DiagramPanel />}
        </section>
      </div>

      {(error || repoError) && (
        <div className="border-t border-red-900 bg-red-950/60 px-4 py-2 text-sm text-red-300">
          {error ?? repoError}
        </div>
      )}
    </div>
  );
}
