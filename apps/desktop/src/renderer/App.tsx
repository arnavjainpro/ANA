import { useEffect, useRef } from 'react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  useGroupRef,
  usePanelRef,
  type Layout,
} from 'react-resizable-panels';
import { TopBar } from './components/TopBar';
import { PopupHeader } from './components/PopupHeader';
import { ConnectPanel } from './components/ConnectPanel';
import { FileTreeSection } from './components/FileTreeSection';
import { AccountFooter } from './components/AccountFooter';
import { SettingsView } from './panels/settings/SettingsView';
import { AnaConversation } from './components/AnaConversation';
import { Composer } from './components/Composer';
import { CommandPalette } from './components/CommandPalette';
import { IndexingProgress } from './components/IndexingProgress';
import { RefreshContext } from './components/RefreshContext';
import { WorkspaceContent } from './components/WorkspaceContent';
import { TerminalPanel } from './panels/terminal/TerminalPanel';
import { useUiStore } from './store/uiStore';
import { useRepoStore } from './store/repoStore';
import { useConversationStore } from './store/conversationStore';
import { useBuildStore } from './store/buildStore';
import { useTerminalStore } from './store/terminalStore';
import { isIpcError } from './lib/ipc';
import { speakViaTavus } from './lib/voiceEcho';
import { ErrorBanner } from './components/ui';
import type { ConversationTurn, FilePatch } from '../types';

// Shared separator styling: a hairline that highlights on hover/drag. The
// library provides a larger invisible hit target via resizeTargetMinimumSize.
const SEPARATOR_CLASSES =
  'bg-surface-border transition-colors duration-150 hover:bg-accent-primary active:bg-accent-primary';

// Varied lines Ana speaks once a voice change has actually been applied.
const BUILD_DONE = [
  'Okay, just made that change.',
  "Done — that's updated.",
  'There we go, that change is in.',
  "All set, I've made that change.",
] as const;

function pickDone(): string {
  return BUILD_DONE[Math.floor(Math.random() * BUILD_DONE.length)] ?? BUILD_DONE[0];
}

/** Apply a spoken change request to disk via the existing Build pipeline. */
async function handleVoiceBuild(transcript: string, history: ConversationTurn[]): Promise<void> {
  const repo = useRepoStore.getState();
  const convo = useConversationStore.getState();
  const build = useBuildStore.getState();
  const fullName = repo.selectedRepo?.full_name;

  useUiStore.getState().setActiveMode('Build');
  // Resolve a stored folder if Build mode was never opened this session.
  if (!build.repoPath && fullName) await build.ensureRepoPath(fullName);

  // History comes from the backend (Tavus) — the renderer doesn't record voice
  // turns, so this is how Build sees what was just planned out loud.
  convo.appendUserTurn(transcript);
  const res = await useBuildStore.getState().runTurn({
    transcript,
    history,
    repoId: repo.repoId ?? undefined,
    repoFullName: fullName,
  });
  if (!res) return; // No local folder chosen — buildStore set the guiding error.

  if (res.patches.length > 0) {
    for (const patch of res.patches) convo.pushAssistant(voiceNarration(patch));
    speakViaTavus(pickDone());
  } else if (res.spoken) {
    // No change made — voice Ana's clarifying question / reason so it isn't silent.
    convo.pushAssistant(res.spoken);
    speakViaTavus(res.spoken);
  }
}

function voiceNarration(patch: FilePatch): string {
  const name = patch.path.split('/').pop() ?? patch.path;
  return `Updated ${name} — ${patch.summary}`;
}

/** Reverse the last change in response to a spoken "undo". */
async function handleVoiceUndo(): Promise<void> {
  const spoken = await useBuildStore.getState().undo();
  if (!spoken) return;
  useConversationStore.getState().pushAssistant(spoken);
  speakViaTavus(spoken);
}

/** Re-apply the most recently undone change in response to a spoken "redo". */
async function handleVoiceRedo(): Promise<void> {
  const spoken = await useBuildStore.getState().redo();
  if (!spoken) return;
  useConversationStore.getState().pushAssistant(spoken);
  speakViaTavus(spoken);
}

/** Speak a line and record it in the conversation history. */
function say(line: string): void {
  useConversationStore.getState().pushAssistant(line);
  speakViaTavus(line);
}

// Lines Ana speaks while project:create's stages run, so the wait never goes quiet.
const CREATE_STAGE_LINES: Record<string, string> = {
  writing: 'Writing the files now…',
  committing: 'Saving the first version…',
  'creating-repo': 'Creating it on GitHub…',
  pushing: 'Pushing your code up…',
};

/**
 * A spoken "build me X" with no repo (or an explicit "start a new project"):
 * scaffold → user picks a parent folder → files + git + GitHub repo + push →
 * connect + index the new repo → launch it on screen.
 */
async function handleVoiceCreateProject(
  transcript: string,
  history: ConversationTurn[],
): Promise<void> {
  const scaffold = await window.ana.project.scaffold(transcript, history);
  if (isIpcError(scaffold)) {
    say("I couldn't put that project together — want to try describing it again?");
    return;
  }

  say(`${scaffold.spoken} Pick a folder where I should put it.`);
  const picked = await window.ana.project.selectParentDir(scaffold.projectName);
  if (isIpcError(picked)) {
    if (picked.error === 'cancelled') {
      say('No problem — just ask again when you want me to create it.');
    } else {
      say(picked.error);
    }
    return;
  }

  const unsubscribe = window.ana.project.onProgress((p) => {
    const line = CREATE_STAGE_LINES[p.stage];
    if (line) speakViaTavus(line);
  });
  const login = useRepoStore.getState().login;
  const result = await window.ana.project.create({ scaffold, parentDir: picked.parentDir, login });
  unsubscribe();

  if (isIpcError(result)) {
    say(result.error);
    return;
  }

  // Make the new project the connected repo.
  const repoState = useRepoStore.getState();
  repoState.setRepos([result.repo, ...repoState.repos.filter((r) => r.id !== result.repo.id)]);
  repoState.selectRepo(result.repo);
  await useBuildStore.getState().ensureRepoPath(result.repo.full_name);
  useUiStore.getState().setActiveMode('Build');

  if (result.warning) {
    say(
      `${scaffold.projectName} is ready on your computer, but I couldn't push it to GitHub yet — we can retry that later. Let me show you.`,
    );
  } else {
    say(`${scaffold.projectName} is live on GitHub. Let me show you.`);
    // Index in the background so Ana can answer questions about the new code.
    void window.ana.repo.index(result.repo.full_name).then((done) => {
      if (isIpcError(done)) return;
      useRepoStore.getState().setRepoId(done.repoId);
      void window.ana.conversation.syncRepo({
        repoId: done.repoId,
        repoFullName: result.repo.full_name,
      });
    });
  }

  await handleVoiceRun('launch');
}

/** A spoken "run it / show me" or "stop it" for the current project. */
async function handleVoiceRun(action: 'launch' | 'stop'): Promise<void> {
  const build = useBuildStore.getState();
  let repoPath = build.repoPath;
  if (!repoPath) {
    const fullName = useRepoStore.getState().selectedRepo?.full_name;
    if (fullName) {
      await build.ensureRepoPath(fullName);
      repoPath = useBuildStore.getState().repoPath;
    }
  }
  if (!repoPath) {
    say("I don't have a local project open to run yet.");
    return;
  }

  if (action === 'stop') {
    await window.ana.run.stop(repoPath);
    say("Okay, I've stopped it.");
    return;
  }

  const unsubscribe = window.ana.run.onProgress((p) => {
    if (p.stage === 'installing') {
      speakViaTavus('Installing what it needs — this can take a minute or two.');
    } else if (p.stage === 'starting') {
      speakViaTavus('Starting it up…');
    }
  });
  const result = await window.ana.run.launch(repoPath);
  unsubscribe();

  if (isIpcError(result)) {
    say(result.error);
  } else if (result.kind === 'static') {
    say('Opening the page for you.');
  } else if (result.url) {
    say('There it is — opening in your browser.');
  } else {
    say("It's running, but I couldn't find its page — check your browser at localhost.");
  }
}

/** A spoken "run npm install" / "run the tests" — executes in the integrated terminal. */
async function handleVoiceTerminal(command: string): Promise<void> {
  const ok = await useTerminalStore.getState().runCommand(command);
  if (!ok) {
    const reason = useTerminalStore.getState().error;
    say(reason ?? "I couldn't run that in the terminal.");
  }
}

export default function App(): JSX.Element {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const isPanelLoading = useUiStore((s) => s.isPanelLoading);
  const setActiveMode = useUiStore((s) => s.setActiveMode);
  const setPanelLoading = useUiStore((s) => s.setPanelLoading);
  const windowMode = useUiStore((s) => s.windowMode);
  const popupExpanded = useUiStore((s) => s.popupExpanded);
  const setWindowState = useUiStore((s) => s.setWindowState);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const composerOpen = useUiStore((s) => s.composerOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const toggleTerminal = useUiStore((s) => s.toggleTerminal);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const applyPanel = useConversationStore((s) => s.applyPanel);
  const { setConnected, setRepos } = useRepoStore();
  const error = useConversationStore((s) => s.error);
  const sessionStarting = useConversationStore((s) => s.sessionStarting);
  const repoError = useRepoStore((s) => s.error);

  const errorRef = useRef<HTMLDivElement>(null);
  const activeError = error ?? repoError;
  const isPopup = windowMode === 'popup';

  // Imperative panel handles: sidebar/terminal toggles and the popup
  // presentation are driven by collapse()/expand()/resize() so the JSX tree —
  // and the live Daily call inside AnaConversation — never changes shape.
  const sidebarPanelRef = usePanelRef();
  const anaPanelRef = usePanelRef();
  const workspacePanelRef = usePanelRef();
  const terminalPanelRef = usePanelRef();
  const colsGroupRef = useGroupRef();

  // Persist layouts across launches; skip saves while in popup mode so the
  // popup's imperative collapse/resize never clobbers the full-window layout.
  const colsLayout = useDefaultLayout({ id: 'ana-cols', storage: localStorage });
  const rowsLayout = useDefaultLayout({ id: 'ana-rows', storage: localStorage });
  const lastFullColsLayout = useRef<Layout | null>(colsLayout.defaultLayout ?? null);

  // Sidebar visibility → panel collapse. Also collapsed for the popup.
  useEffect(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (sidebarOpen && !isPopup) panel.expand();
    else panel.collapse();
  }, [sidebarOpen, isPopup, sidebarPanelRef]);

  // Terminal visibility → panel collapse. expand() restores the previous size;
  // on the very first open there is none, so fall back to a sensible height.
  useEffect(() => {
    const panel = terminalPanelRef.current;
    if (!panel) return;
    if (terminalOpen && !isPopup) {
      panel.expand();
      if (panel.getSize().inPixels < 50) panel.resize('240px');
    } else {
      panel.collapse();
    }
  }, [terminalOpen, isPopup, terminalPanelRef]);

  // Popup presentation: Ana pane fills the floating window; expanding the
  // flyout reveals the workspace next to a fixed-width Ana pane. Returning to
  // full restores the last full-window column layout.
  useEffect(() => {
    const workspace = workspacePanelRef.current;
    if (!workspace) return;
    if (isPopup) {
      if (popupExpanded) {
        workspace.expand();
        anaPanelRef.current?.resize('280px');
      } else {
        workspace.collapse();
      }
    } else {
      workspace.expand();
      const saved = lastFullColsLayout.current;
      if (saved) colsGroupRef.current?.setLayout(saved);
    }
  }, [isPopup, popupExpanded, workspacePanelRef, anaPanelRef, colsGroupRef]);

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

  // Voice (Tavus) turns reach the renderer via pushed events: a 'panel' renders
  // a diagram/board; a 'build-request' applies a change through the Build pipeline.
  useEffect(() => {
    const unsubscribe = window.ana.conversation.onPanelUpdate((evt) => {
      if (evt.type === 'build-request') {
        void handleVoiceBuild(evt.transcript, evt.history);
        return;
      }
      if (evt.type === 'undo-request') {
        void handleVoiceUndo();
        return;
      }
      if (evt.type === 'redo-request') {
        void handleVoiceRedo();
        return;
      }
      if (evt.type === 'create-project-request') {
        void handleVoiceCreateProject(evt.transcript, evt.history);
        return;
      }
      if (evt.type === 'run-request') {
        void handleVoiceRun(evt.action);
        return;
      }
      if (evt.type === 'terminal-request') {
        void handleVoiceTerminal(evt.command);
        return;
      }
      setActiveMode(evt.mode);
      applyPanel(evt);
      setPanelLoading(false);
      // Popup UX: a voice-pushed diagram/board should be visible, so open the
      // workspace flyout if it's collapsed.
      const ui = useUiStore.getState();
      if (ui.windowMode === 'popup' && !ui.popupExpanded) {
        void window.ana.window.setPopupExpanded(true);
      }
    });
    return unsubscribe;
  }, [applyPanel, setActiveMode, setPanelLoading]);

  // Mirror the main process's window presentation (full ↔ popup). getMode on
  // mount covers dev HMR reloads that happen while already in popup mode.
  useEffect(() => {
    void window.ana.window.getMode().then(setWindowState);
    return window.ana.window.onModeChanged(setWindowState);
  }, [setWindowState]);

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

  // Cmd+` / Ctrl+` toggles the integrated terminal, VS Code style.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault();
        toggleTerminal();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTerminal]);

  return (
    <div className="relative flex h-screen w-screen flex-col bg-surface-base text-text-primary">
      {isPopup ? <PopupHeader /> : <TopBar />}

      {/* Both PanelGroups render unconditionally in full AND popup modes — the
          popup presentation is driven purely by imperative collapse/resize so
          the live Daily call inside AnaConversation never unmounts. */}
      <Group
        orientation="vertical"
        id="ana-rows"
        className="flex-1 min-h-0"
        defaultLayout={rowsLayout.defaultLayout}
        onLayoutChanged={(layout) => {
          if (useUiStore.getState().windowMode !== 'popup') rowsLayout.onLayoutChanged(layout);
        }}
        resizeTargetMinimumSize={{ coarse: 24, fine: 8 }}
      >
        <Panel id="main" minSize="30%">
          <Group
            orientation="horizontal"
            id="ana-cols"
            groupRef={colsGroupRef}
            className="h-full"
            defaultLayout={colsLayout.defaultLayout}
            onLayoutChanged={(layout) => {
              if (useUiStore.getState().windowMode !== 'popup') {
                lastFullColsLayout.current = layout;
                colsLayout.onLayoutChanged(layout);
              }
            }}
            resizeTargetMinimumSize={{ coarse: 24, fine: 8 }}
          >
            <Panel
              id="sidebar"
              panelRef={sidebarPanelRef}
              collapsible
              collapsedSize={0}
              defaultSize="22%"
              minSize="14%"
              maxSize="32%"
              onResize={(size) => {
                // Dragging the sidebar shut should flip the TopBar toggle too.
                if (useUiStore.getState().windowMode !== 'popup') {
                  const open = size.inPixels > 1;
                  if (open !== useUiStore.getState().sidebarOpen) setSidebarOpen(open);
                }
              }}
            >
              <aside
                aria-label="Repository"
                className="flex h-full flex-col overflow-hidden border-r border-surface-border bg-surface-raised"
              >
                <ConnectPanel />
                <FileTreeSection />
                <AccountFooter />
              </aside>
            </Panel>
            <Separator className={`${SEPARATOR_CLASSES} ${isPopup || !sidebarOpen ? 'hidden' : 'w-px'}`} />
            <Panel id="ana" panelRef={anaPanelRef} defaultSize="32%" minSize="18%">
              <aside
                aria-label="Ana"
                aria-busy={sessionStarting}
                className="flex h-full flex-col overflow-hidden border-r border-surface-border bg-surface-raised"
              >
                <div className={isPopup ? 'hidden' : ''}>
                  <RefreshContext />
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <AnaConversation />
                </div>
                {composerOpen && !isPopup && <Composer />}
              </aside>
            </Panel>
            <Separator className={`${SEPARATOR_CLASSES} ${isPopup ? 'hidden' : 'w-px'}`} />
            <Panel id="workspace" panelRef={workspacePanelRef} collapsible collapsedSize={0} minSize="25%">
              <main
                id="ana-workspace"
                aria-label="Workspace"
                aria-busy={isPanelLoading}
                className="relative h-full min-h-0 overflow-hidden bg-surface-base"
              >
                <IndexingProgress />
                <WorkspaceContent />
              </main>
            </Panel>
          </Group>
        </Panel>
        <Separator
          className={`${SEPARATOR_CLASSES} ${!terminalOpen || isPopup ? 'hidden' : 'h-px'}`}
        />
        {/* Collapsed (not unmounted) when closed so the shell session inside
            TerminalPanel survives the panel being toggled. */}
        <Panel
          id="terminal"
          panelRef={terminalPanelRef}
          collapsible
          collapsedSize={0}
          defaultSize={0}
          maxSize="60%"
          onResize={(size) => {
            // Dragging the terminal shut should flip terminalOpen so Cmd+`
            // re-opens it — but only user drags in full mode, never the
            // popup's imperative collapse.
            if (useUiStore.getState().windowMode !== 'popup') {
              const open = size.inPixels > 1;
              if (open !== useUiStore.getState().terminalOpen) {
                useUiStore.getState().setTerminalOpen(open);
              }
            }
          }}
        >
          <div className="h-full overflow-hidden border-t border-surface-border">
            <TerminalPanel />
          </div>
        </Panel>
      </Group>

      {activeError && (
        <ErrorBanner ref={errorRef} message={activeError} className="border-t" />
      )}

      <CommandPalette />
      {settingsOpen && <SettingsView />}
    </div>
  );
}
