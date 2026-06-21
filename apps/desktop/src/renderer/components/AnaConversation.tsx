import { useState } from 'react';
import { useConversationStore } from '../store/conversationStore';
import { isIpcError } from '../lib/ipc';

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
  const { conversationUrl, setConversation, setError } = useConversationStore();
  const [starting, setStarting] = useState(false);

  async function handleStart(): Promise<void> {
    setStarting(true);
    setError(null);
    const result = await window.ana.conversation.start();
    setStarting(false);
    if (isIpcError(result)) {
      setError(result.error);
      return;
    }
    setConversation(result.conversationId, result.conversationUrl);
  }

  if (!conversationUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-ana-panel">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto text-ana-text-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-semibold text-ana-text">Start a conversation</p>
          <p className="mt-1 text-xs text-ana-text-muted">Initialize Ana to begin discussing this repository</p>
        </div>
        <button
          type="button"
          onClick={handleStart}
          disabled={starting}
          className="rounded px-4 py-2 text-sm font-medium text-ana-bg bg-ana-accent hover:bg-ana-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {starting ? 'Starting…' : 'Start Ana'}
        </button>
      </div>
    );
  }

  return (
    <iframe
      title="Ana"
      src={conversationUrl}
      allow="camera; microphone; autoplay; display-capture"
      className="h-full w-full border-0 bg-ana-bg"
    />
  );
}
