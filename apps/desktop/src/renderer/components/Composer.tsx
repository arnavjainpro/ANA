import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useConversationStore, recentHistory } from '../store/conversationStore';
import { useRepoStore } from '../store/repoStore';
import { useUiStore } from '../store/uiStore';
import { useBuildStore } from '../store/buildStore';
import { isIpcError } from '../lib/ipc';
import { Spinner, Kbd } from './ui';
import type { FilePatch } from '../../types';

/** Stagger between per-file narration lines, so changes stream in like live work. */
const NARRATION_STAGGER_MS = 700;

/** Present-tense one-liner describing a single applied patch ("just did this…"). */
function narrationLine(patch: FilePatch): string {
  const name = patch.path.split('/').pop() ?? patch.path;
  return `Updated ${name} — ${patch.summary}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const openBuildFile = useBuildStore((s) => s.openFile);

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
      const res = await runBuildTurn({
        transcript: utterance,
        history: recentHistory(history),
        repoId: repoId ?? undefined,
        repoFullName: selectedRepo?.full_name,
      });
      if (!res) return;
      if (res.patches.length > 0) {
        // Narrate one line per file as its diff comes into view ("just did this…").
        for (const [i, patch] of res.patches.entries()) {
          void openBuildFile(patch.path);
          pushAssistant(narrationLine(patch));
          if (i < res.patches.length - 1) await delay(NARRATION_STAGGER_MS);
        }
      } else if (res.spoken) {
        pushAssistant(res.spoken);
      }
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

  const canSend = ready && !busy && text.trim().length > 0;

  return (
    <div className="flex flex-col gap-1.5 border-t border-surface-border bg-surface-raised p-3 animate-fade-in-up">
      {/* Input + send share a single bordered shell that lights up on focus. */}
      <div className="group flex items-center gap-2 rounded-lg border border-surface-border bg-surface-overlay px-2 py-1.5 transition-colors duration-150 focus-within:border-accent-border focus-within:shadow-focus-brand">
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
                : 'Ask Ana anything…'
              : buildMode
                ? 'Select your local folder to begin…'
                : 'Index a repo to begin…'
          }
          disabled={!ready || busy}
          className="flex-1 bg-transparent px-2 py-1 text-sm text-text-primary outline-none placeholder:text-text-tertiary disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          aria-disabled={!canSend}
          aria-busy={busy}
          aria-label="Send message"
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
            canSend
              ? 'cursor-pointer bg-accent-primary text-white hover:bg-accent-hover'
              : 'cursor-not-allowed bg-surface-hover text-text-tertiary'
          }`}
        >
          {busy ? <Spinner size={14} /> : <ArrowRight size={14} strokeWidth={1.75} aria-hidden />}
        </button>
      </div>
      <p className="flex items-center gap-1 px-1 text-xs text-text-tertiary">
        <Kbd>↵</Kbd> to send
      </p>
    </div>
  );
}
