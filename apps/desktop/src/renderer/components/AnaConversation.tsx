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
          <p className="text-lg font-medium">Ana</p>
          <p className="mt-1 text-sm text-gray-400">Start a session to talk with Ana.</p>
        </div>
        <button
          type="button"
          onClick={handleStart}
          disabled={starting}
          className="rounded-md bg-ana-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
      className="h-full w-full border-0 bg-black"
    />
  );
}
