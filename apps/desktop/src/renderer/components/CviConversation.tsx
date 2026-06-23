import { useEffect } from 'react';
import {
  DailyProvider,
  DailyAudio,
  DailyVideo,
  useAudioTrack,
  useDaily,
  useLocalSessionId,
  useParticipantIds,
} from '@daily-co/daily-react';
import { useConversationStore } from '../store/conversationStore';

/**
 * Renders the Tavus call ourselves via the Daily call object (the same engine
 * @tavus/cvi-ui scaffolds) instead of the default prebuilt grid, so we control
 * the layout: Ana (the remote replica) fills the pane and the local camera sits
 * in a small corner picture-in-picture.
 *
 * Tavus's conversation URL is a Daily room; we join it, show the remote video
 * full-bleed, and play the remote audio so Ana can be heard.
 */

/** Joins the Daily room on mount and leaves on unmount. */
function CallJoiner({ url }: { url: string }): null {
  const daily = useDaily();
  useEffect(() => {
    if (!daily) return undefined;
    const state = daily.meetingState();
    // Guard against double-join (e.g. React StrictMode remounts in dev).
    if (state === 'new' || state === 'left-meeting') {
      void daily.join({ url });
    }
    return () => {
      void daily.leave();
    };
  }, [daily, url]);
  return null;
}

/** Mic mute toggle + leave, shown over the local PiP. */
function CallControls(): JSX.Element {
  const daily = useDaily();
  const localId = useLocalSessionId();
  const localAudio = useAudioTrack(localId);
  const muted = localAudio.isOff;

  const toggleMute = (): void => {
    // setLocalAudio(enabled): enable when currently muted, disable otherwise.
    daily?.setLocalAudio(muted);
  };

  const leave = async (): Promise<void> => {
    await daily?.leave();
    const { conversationId, clearConversation } = useConversationStore.getState();
    // End the Tavus session so it stops metering and frees a concurrency slot.
    if (conversationId) void window.ana.conversation.end(conversationId);
    clearConversation();
  };

  return (
    <div className="absolute bottom-3 left-3 flex items-center gap-2">
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
        aria-pressed={muted}
        className="rounded-full bg-black/40 p-2 text-white backdrop-blur transition-colors hover:bg-black/60"
      >
        {muted ? (
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 14l4-4m0 4l-4-4" />
          </svg>
        ) : (
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.536 8.464a5 5 0 010 7.072M19 5a9 9 0 010 14" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={() => void leave()}
        aria-label="Leave call"
        className="rounded-full bg-red-600/80 p-2 text-white transition-colors hover:bg-red-600"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 5a2 2 0 012-2h2.28a1 1 0 01.948.684l1.07 3.292a1 1 0 01-.27 1.04l-1.518 1.518a11.04 11.04 0 005.196 5.196l1.518-1.518a1 1 0 011.04-.27l3.292 1.07a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 3L3 21" />
        </svg>
      </button>
    </div>
  );
}

/** Ana full-bleed; local self-view as a small bottom-right PiP. */
function CallStage(): JSX.Element {
  const localId = useLocalSessionId();
  const remoteIds = useParticipantIds({ filter: 'remote' });
  const anaId = remoteIds[0];

  return (
    <div className="relative h-full w-full overflow-hidden bg-ana-panel">
      {anaId ? (
        <DailyVideo
          sessionId={anaId}
          type="video"
          automirror={false}
          fit="cover"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-ana-text-muted">Connecting to Ana…</p>
        </div>
      )}

      {localId && (
        <DailyVideo
          sessionId={localId}
          type="video"
          mirror
          fit="cover"
          className="absolute bottom-3 right-3 h-28 w-40 rounded-lg border border-ana-border object-cover shadow-lg"
        />
      )}

      <CallControls />

      {/* Plays Ana's (and any other remote) audio. */}
      <DailyAudio />
    </div>
  );
}

export function CviConversation({ conversationUrl }: { conversationUrl: string }): JSX.Element {
  return (
    <DailyProvider>
      <CallJoiner url={conversationUrl} />
      <CallStage />
    </DailyProvider>
  );
}
