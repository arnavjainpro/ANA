import { useEffect, useState } from 'react';
import { useConversationStore } from '../store/conversationStore';
import { useRepoStore } from '../store/repoStore';
import { CviConversation } from './CviConversation';
import { isIpcError } from '../lib/ipc';

/**
 * When VITE_TAVUS_MANUAL_START is "false", Ana boots straight into the Tavus
 * call on launch (only once GitHub is connected, so we never bill a session on
 * an unauthed launch). Any other value — including the dev default — keeps the
 * manual "Start Ana" button so we don't burn Tavus/API tokens while iterating.
 */
const MANUAL_START = import.meta.env.VITE_TAVUS_MANUAL_START !== 'false';

/**
 * Mounts Ana's face + microphone.
 *
 * The Tavus conversation URL is a Daily room that runs in an iframe with camera
 * and microphone permissions. Ana speaks the `spoken` value Claude returns via
 * the persona's LLM override (configured backend-side).
 *
 * TODO: swap this iframe for the <Conversation> component from @tavus/cvi-ui
 * once its API surface is pinned. The iframe is functionally equivalent for the
 * MVP and avoids depending on an early (0.0.x) package release.
 */
export function AnaConversation(): JSX.Element {
  const { conversationUrl, sessionStarting, setConversation, setSessionStarting, setError } =
    useConversationStore();
  const connected = useRepoStore((s) => s.connected);
  // Drives the placeholder → video opacity crossfade once the session mounts.
  const [videoShown, setVideoShown] = useState(false);

  useEffect(() => {
    if (conversationUrl) {
      const id = requestAnimationFrame(() => setVideoShown(true));
      return () => cancelAnimationFrame(id);
    }
    setVideoShown(false);
    return undefined;
  }, [conversationUrl]);

  async function handleStart(): Promise<void> {
    setSessionStarting(true);
    setError(null);
    const result = await window.ana.conversation.start();
    setSessionStarting(false);
    if (isIpcError(result)) {
      setError(result.error);
      return;
    }
    setConversation(result.conversationId, result.conversationUrl);
  }

  // Auto-boot into the call when manual start is disabled and GitHub is already
  // connected. Guarded against double-starts (no URL yet, not already starting).
  useEffect(() => {
    if (MANUAL_START || !connected || conversationUrl || sessionStarting) return;
    void handleStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, conversationUrl, sessionStarting]);

  if (conversationUrl) {
    return (
      <div
        className={`h-full w-full transition-opacity duration-[250ms] ease-out ${
          videoShown ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <CviConversation conversationUrl={conversationUrl} />
      </div>
    );
  }

  // While a session initializes, show a subtle pulsing avatar placeholder.
  if (sessionStarting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-ana-panel">
        <div className="text-center">
          <svg
            aria-hidden="true"
            className="w-12 h-12 mx-auto text-ana-text-muted mb-2 ana-pulse"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-semibold text-ana-text">Connecting to Ana…</p>
          <p className="mt-1 text-xs text-ana-text-muted">Setting up your session</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-ana-panel">
      <div className="text-center">
        <svg aria-hidden="true" className="w-12 h-12 mx-auto text-ana-text-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm font-semibold text-ana-text">Start a conversation</p>
        <p className="mt-1 text-xs text-ana-text-muted">Initialize Ana to begin discussing this repository</p>
      </div>
      <button
        type="button"
        onClick={handleStart}
        className="rounded px-4 py-2 text-sm font-medium text-ana-bg bg-ana-accent hover:bg-ana-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Start Ana
      </button>
    </div>
  );
}
