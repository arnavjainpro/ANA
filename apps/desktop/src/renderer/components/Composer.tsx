import { useState } from 'react';
import { useConversationStore, recentHistory } from '../store/conversationStore';
import { useRepoStore } from '../store/repoStore';
import { useUiStore } from '../store/uiStore';
import { isIpcError } from '../lib/ipc';

/**
 * Typed utterance input. Voice input is handled by Tavus, but a text composer
 * lets a user drive a turn (and the two-call Claude pipeline) without speaking.
 */
export function Composer(): JSX.Element {
  const [text, setText] = useState('');
  const { history, processing, setProcessing, appendUserTurn, applyResult, setError } =
    useConversationStore();
  const { repoId, selectedRepo, indexStatus } = useRepoStore();
  const { activeMode, modeLocked, setMode } = useUiStore();

  const ready = repoId !== null && indexStatus === 'ready';

  async function send(): Promise<void> {
    const utterance = text.trim();
    if (!utterance || !repoId || processing) return;

    setText('');
    setError(null);
    appendUserTurn(utterance);
    setProcessing(true);

    const result = await window.ana.conversation.turn({
      repoId,
      repoFullName: selectedRepo?.full_name,
      utterance,
      history: recentHistory(history),
      forcedMode: modeLocked ? activeMode : undefined,
    });

    setProcessing(false);
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
          placeholder={ready ? 'Ask Ana (Shift+Enter for new line)…' : 'Index a repo to begin…'}
          disabled={!ready || processing}
          className="flex-1 rounded border border-ana-border bg-ana-bg px-3 py-2 text-sm text-ana-text outline-none placeholder:text-ana-text-muted focus:border-ana-accent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!ready || processing || !text.trim()}
          className="rounded px-4 py-2 text-sm font-medium text-ana-bg bg-ana-accent hover:bg-ana-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? (
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
