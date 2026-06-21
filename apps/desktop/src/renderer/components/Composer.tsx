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
    <div className="flex items-center gap-2 border-t border-ana-border bg-ana-panel p-3">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void send();
        }}
        placeholder={ready ? 'Ask Ana about this repo…' : 'Index a repo to begin…'}
        disabled={!ready || processing}
        className="flex-1 rounded-md border border-ana-border bg-ana-bg px-3 py-2 text-sm outline-none focus:border-ana-accent disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => void send()}
        disabled={!ready || processing}
        className="rounded-md bg-ana-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {processing ? '…' : 'Send'}
      </button>
    </div>
  );
}
