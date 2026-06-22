import { useState } from 'react';
import { useConversationStore, recentHistory } from '../store/conversationStore';
import { useRepoStore } from '../store/repoStore';
import { useUiStore } from '../store/uiStore';
import { useBuildStore } from '../store/buildStore';
import { isIpcError } from '../lib/ipc';

/**
 * Typed utterance input. Voice input is handled by Tavus, but a text composer
 * lets a user drive a turn (and the two-call Claude pipeline) without speaking.
 */
export function Composer(): JSX.Element {
  const [text, setText] = useState('');
  const { history, processing, setProcessing, appendUserTurn, pushAssistant, applyResult, setError } =
    useConversationStore();
  const { repoId, selectedRepo, indexStatus } = useRepoStore();
  const { activeMode, modeLocked, setMode, setPanelLoading } = useUiStore();
  const buildRepoPath = useBuildStore((s) => s.repoPath);
  const buildBusy = useBuildStore((s) => s.busy);
  const runBuildTurn = useBuildStore((s) => s.runTurn);

  const buildMode = activeMode === 'Build';
  const ready = buildMode ? buildRepoPath !== null : repoId !== null && indexStatus === 'ready';
  const busy = processing || buildBusy;

  async function send(): Promise<void> {
    const utterance = text.trim();
    if (!utterance || busy || !ready) return;

    if (buildMode) {
      setText('');
      setError(null);
      appendUserTurn(utterance);
      const spoken = await runBuildTurn({
        transcript: utterance,
        history: recentHistory(history),
        repoId: repoId ?? undefined,
        repoFullName: selectedRepo?.full_name,
      });
      if (spoken) pushAssistant(spoken);
      return;
    }

    if (!repoId) return;
    setText('');
    setError(null);
    appendUserTurn(utterance);
    setProcessing(true);
    // The right panel shows its skeleton while the Claude turn is in flight.
    setPanelLoading(true);

    const result = await window.ana.conversation.turn({
      repoId,
      repoFullName: selectedRepo?.full_name,
      utterance,
      history: recentHistory(history),
      forcedMode: modeLocked ? activeMode : undefined,
    });

    setProcessing(false);
    setPanelLoading(false);
    if (isIpcError(result)) {
      setError(result.error);
      return;
    }
    // Reflect Ana's chosen mode in the UI when not manually locked.
    if (!modeLocked) setMode(result.mode);
    applyResult(result);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-ana-border bg-ana-panel p-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={
            ready
              ? buildMode
                ? 'Tell Ana what to change…'
                : 'Ask Ana (Shift+Enter for new line)…'
              : buildMode
                ? 'Select your local folder to begin…'
                : 'Index a repo to begin…'
          }
          disabled={!ready || busy}
          className="flex-1 rounded border border-ana-border bg-ana-bg px-3 py-2 text-sm text-ana-text outline-none placeholder:text-ana-text-muted focus:border-ana-accent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!ready || busy || !text.trim()}
          aria-disabled={!ready || busy || !text.trim()}
          aria-busy={busy}
          aria-label="Send message"
          className="rounded px-4 py-2 text-sm font-medium text-ana-bg bg-ana-accent hover:bg-ana-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? (
            <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m0 0h6" />
            </svg>
          ) : (
            'Send'
          )}
        </button>
      </div>
      <p className="text-xs text-ana-text-muted px-1">Shift+Enter for multiline</p>
    </div>
  );
}
