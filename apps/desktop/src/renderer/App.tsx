import { useEffect, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { PopupHeader } from './components/PopupHeader';
import { ConnectPanel } from './components/ConnectPanel';
import { FileTreeSection } from './components/FileTreeSection';
import { AnaConversation } from './components/AnaConversation';
import { CommandPalette } from './components/CommandPalette';
import { IndexingProgress } from './components/IndexingProgress';
import { RefreshContext } from './components/RefreshContext';
import { WorkspaceContent } from './components/WorkspaceContent';
import { FileViewerPanel } from './panels/viewer/FileViewerPanel';
import { useUiStore } from './store/uiStore';
import { useRepoStore } from './store/repoStore';
import { useConversationStore } from './store/conversationStore';
import { useBuildStore } from './store/buildStore';
import { isIpcError } from './lib/ipc';
import { speakViaTavus } from './lib/voiceEcho';
import type { ConversationTurn, FilePatch } from '../types';

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

export default function App(): JSX.Element {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const isPanelLoading = useUiStore((s) => s.isPanelLoading);
  const setActiveMode = useUiStore((s) => s.setActiveMode);
  const setPanelLoading = useUiStore((s) => s.setPanelLoading);
  const windowMode = useUiStore((s) => s.windowMode);
  const popupExpanded = useUiStore((s) => s.popupExpanded);
  const setWindowState = useUiStore((s) => s.setWindowState);
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
  const isPopup = windowMode === 'popup';

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
      {isPopup ? <PopupHeader /> : <TopBar />}

      <div id="main-content" className="flex flex-1 min-h-0 overflow-hidden">
        {sidebarOpen && !isPopup && (
          <aside
            aria-label="Repository"
            className="w-80 flex flex-col border-r border-ana-border bg-ana-panel overflow-hidden flex-shrink-0"
          >
            <ConnectPanel />
            <FileTreeSection />
          </aside>
        )}

        {/* This aside (and AnaConversation inside it) must stay mounted across
            full ↔ popup — unmounting drops the live Daily call. Only classes
            and inline width change between presentations. */}
        <aside
          ref={anaPaneRef}
          aria-label="Ana"
          aria-busy={sessionStarting}
          className={`flex flex-col bg-ana-panel overflow-hidden ${
            isPopup
              ? popupExpanded
                ? 'w-[280px] flex-shrink-0 border-r border-ana-border'
                : 'flex-1'
              : 'border-r border-ana-border'
          }`}
          style={isPopup ? undefined : { width: `${centerWidth}%` }}
        >
          <div className={isPopup ? 'hidden' : ''}>
            <RefreshContext />
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <AnaConversation />
          </div>
        </aside>

        <div
          aria-hidden="true"
          onMouseDown={handleMouseDown}
          className={`w-1 cursor-col-resize bg-ana-border transition-colors hover:bg-ana-brand ${
            dragging ? 'bg-ana-brand' : ''
          } ${isPopup ? 'hidden' : ''}`}
        />

        {/* Hidden (not unmounted) when the popup is collapsed so Monaco/diagram
            state survives expand/collapse. */}
        <main
          id="ana-workspace"
          aria-label="Workspace"
          aria-busy={isPanelLoading}
          className={`relative flex-1 min-h-0 overflow-hidden bg-ana-bg ${
            isPopup && !popupExpanded ? 'hidden' : ''
          }`}
        >
          <IndexingProgress />
          <WorkspaceContent />
          <FileViewerPanel />
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
