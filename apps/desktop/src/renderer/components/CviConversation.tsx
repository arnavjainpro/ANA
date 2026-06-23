import { useEffect } from 'react';
import {
  DailyProvider,
  DailyAudio,
  DailyVideo,
  useDaily,
  useLocalSessionId,
  useParticipantIds,
} from '@daily-co/daily-react';

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
