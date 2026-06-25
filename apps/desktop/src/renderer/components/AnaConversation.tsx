import { useEffect, useState } from 'react';
import { useConversationStore } from '../store/conversationStore';
import { useRepoStore } from '../store/repoStore';
import { CviConversation } from './CviConversation';
import { isIpcError } from '../lib/ipc';
import anaAvatar from '../assets/ana-avatar.png';

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

  // While a session initializes, show a branded, gently pulsing avatar orb.
  if (sessionStarting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 bg-ana-panel">
        <div className="relative flex h-20 w-20 items-center justify-center">
          {/* Expanding rings convey "connecting" without a spinner. */}
          <span className="absolute inset-0 rounded-full bg-ana-brand/15 ana-pulse" />
          <span className="absolute inset-2 rounded-full bg-ana-brand/25 ana-pulse" style={{ animationDelay: '300ms' }} />
          <span className="relative h-12 w-12 rounded-full bg-ana-brand" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-ana-text">Connecting to Ana…</p>
          <p className="mt-1 text-xs text-ana-text-muted">Setting up your session</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full animate-fade-in-up flex-col items-center justify-center gap-5 bg-ana-panel px-6">
      <img
        src={anaAvatar}
        alt=""
        className="h-20 w-20 rounded-full object-cover ring-1 ring-ana-border"
      />
      <div className="text-center">
        <p className="text-base font-semibold text-ana-text">Start a conversation</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-ana-text-muted">
          Initialize Ana to begin talking through this repository.
        </p>
      </div>
      <button
        type="button"
        onClick={handleStart}
        className="flex items-center gap-2 rounded-lg bg-ana-brand px-5 py-2.5 text-sm font-medium text-white shadow-glow transition-all duration-150 hover:bg-ana-brand-hover hover:shadow-glow-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
        Start Ana
      </button>
    </div>
  );
}
