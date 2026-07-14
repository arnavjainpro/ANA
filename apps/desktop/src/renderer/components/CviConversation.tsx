import { useCallback, useEffect, useState } from 'react';
import {
  DailyProvider,
  DailyAudio,
  DailyVideo,
  useAudioTrack,
  useDaily,
  useDailyEvent,
  useLocalSessionId,
  useParticipantIds,
  useVideoTrack,
} from '@daily-co/daily-react';
import { useConversationStore } from '../store/conversationStore';
import { useUiStore } from '../store/uiStore';
import { bindVoice } from '../lib/voiceEcho';

/**
 * Listens for Tavus replica speech over the Daily data channel and pushes each
 * spoken utterance into the store, where the diagram uses it to highlight the
 * node Ana is currently talking about. Tavus emits these as app-messages whose
 * `event_type` contains "utterance" with `properties.role === 'replica'`; we
 * stay permissive about the exact shape so a Tavus event-name change degrades
 * to "no highlight" rather than a crash.
 */
interface TavusMessage {
  event_type?: string;
  message_type?: string;
  properties?: { role?: string; speech?: string; text?: string; transcript?: string };
  [key: string]: unknown;
}

// Flip on to log the raw Tavus events when debugging speech-synced
// highlighting. Filter the renderer DevTools console by "[ana-cvi]".
const DEBUG_CVI = false;

function ReplicaTranscriptBridge(): null {
  const pushUtterance = useConversationStore((s) => s.pushUtterance);
  useDailyEvent(
    'app-message',
    useCallback(
      (ev: { data?: unknown; fromId?: string }) => {
        // Tavus may deliver `data` as an object OR a JSON string — normalize.
        let data: TavusMessage | undefined;
        const raw = ev?.data;
        if (typeof raw === 'string') {
          try {
            data = JSON.parse(raw) as TavusMessage;
          } catch {
            data = undefined;
          }
        } else if (raw && typeof raw === 'object') {
          data = raw as TavusMessage;
        }

        if (DEBUG_CVI) {
          console.debug('[ana-cvi] app-message', { fromId: ev?.fromId, raw });
        }
        if (!data) return;

        const props = data.properties ?? {};
        const role = props.role;
        if (role && role !== 'replica') return; // ignore the user's own speech

        const evType = (data.event_type ?? '').toLowerCase();
        const text = props.speech ?? props.text ?? props.transcript ?? '';
        const looksLikeUtterance =
          evType.includes('utterance') ||
          evType.includes('speech') ||
          evType.includes('transcri') ||
          Boolean(text);
        if (!looksLikeUtterance || !text.trim()) return;

        if (DEBUG_CVI) console.debug('[ana-cvi] replica utterance →', text);
        pushUtterance(text);
      },
      [pushUtterance],
    ),
  );
  return null;
}

/**
 * Renders the Tavus call ourselves via the Daily call object (the same engine
 * @tavus/cvi-ui scaffolds) instead of the default prebuilt grid, so we control
 * the layout: Ana (the remote replica) fills the pane and the local camera sits
 * in a small corner picture-in-picture.
 *
 * Tavus's conversation URL is a Daily room; we join it, show the remote video
 * full-bleed, and play the remote audio so Ana can be heard.
 */

/** Joins the Daily room if the provider didn't auto-join; leaves on unmount. */
function CallJoiner({ url }: { url: string }): null {
  const daily = useDaily();
  useEffect(() => {
    if (!daily) return undefined;
    // The provider auto-joins when given `url`; only join here if it hasn't
    // (state 'new'), and guard against double-join on StrictMode remounts.
    const state = daily.meetingState();
    if (state === 'new' || state === 'left-meeting') {
      void daily.join({ url }).catch((err) => {
        console.error('[cvi] join failed', err);
      });
    }
    return () => {
      void daily.leave();
    };
  }, [daily, url]);
  return null;
}

/** Expose the call object so the voice-Build handler can echo a follow-up line. */
function VoiceEchoBridge(): null {
  const daily = useDaily();
  const conversationId = useConversationStore((s) => s.conversationId);
  useEffect(() => {
    bindVoice(daily, conversationId);
    return () => bindVoice(null, null);
  }, [daily, conversationId]);
  return null;
}

/** Mic, camera, and leave controls, shown over the video (bottom-left). */
function CallControls(): JSX.Element {
  const daily = useDaily();
  const localId = useLocalSessionId();
  const muted = useAudioTrack(localId).isOff;
  const cameraOff = useVideoTrack(localId).isOff;

  const leave = async (): Promise<void> => {
    await daily?.leave();
    const { conversationId, clearConversation } = useConversationStore.getState();
    // End the Tavus session so it stops metering and frees a concurrency slot.
    if (conversationId) void window.ana.conversation.end(conversationId);
    clearConversation();
  };

  const btn = 'rounded-full bg-black/40 p-2 text-white backdrop-blur transition-colors hover:bg-black/60';

  return (
    // stopPropagation: in the collapsed popup the whole stage is click-to-expand;
    // the call controls must not also trigger that.
    <div
      className="absolute bottom-3 left-3 flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => daily?.setLocalAudio(muted)}
        aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
        aria-pressed={muted}
        className={btn}
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
        onClick={() => daily?.setLocalVideo(cameraOff)}
        aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
        aria-pressed={cameraOff}
        className={btn}
      >
        {cameraOff ? (
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 7h7a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3l18 18" />
          </svg>
        ) : (
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 7h7a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z" />
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
  const [error, setError] = useState<string | null>(null);
  // Popup presentation is read from the store (not props) so this component's
  // tree position — and the Daily call above it — stays stable across modes.
  const isPopup = useUiStore((s) => s.windowMode === 'popup');
  const popupExpanded = useUiStore((s) => s.popupExpanded);
  const isCollapsedPopup = isPopup && !popupExpanded;

  const expand = (): void => {
    void window.ana.window.setPopupExpanded(true);
  };

  // Surface call/device failures on screen instead of a permanent "Connecting".
  useDailyEvent(
    'error',
    useCallback((ev: { errorMsg?: string }) => setError(ev?.errorMsg ?? 'The call ran into an error.'), []),
  );
  useDailyEvent(
    'camera-error',
    useCallback(() => setError('Could not access your camera or microphone.'), []),
  );

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-surface-raised ${
        isCollapsedPopup ? 'cursor-pointer' : ''
      }`}
      onClick={isCollapsedPopup ? expand : undefined}
    >
      {anaId ? (
        <DailyVideo
          sessionId={anaId}
          type="video"
          automirror={false}
          fit="cover"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-sm text-text-secondary">{error ? 'Couldn’t connect' : 'Connecting to Ana…'}</p>
          {error && <p className="text-xs text-status-danger">{error}</p>}
        </div>
      )}

      {localId && (
        <DailyVideo
          sessionId={localId}
          type="video"
          mirror
          fit="cover"
          className={`absolute bottom-3 right-3 h-28 w-40 rounded-lg border border-surface-border object-cover shadow-lg ${
            isPopup ? 'hidden' : ''
          }`}
        />
      )}

      {isCollapsedPopup && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            expand();
          }}
          aria-label="Open workspace"
          title="Open workspace"
          className="absolute bottom-3 right-3 rounded-full bg-black/40 p-2 text-white backdrop-blur transition-colors hover:bg-black/60"
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      <CallControls />

      {/* Plays Ana's (and any other remote) audio. */}
      <DailyAudio />
    </div>
  );
}

export function CviConversation({ conversationUrl }: { conversationUrl: string }): JSX.Element {
  return (
    // Passing `url` makes the provider create (and join) the call object.
    <DailyProvider url={conversationUrl}>
      <CallJoiner url={conversationUrl} />
      <VoiceEchoBridge />
      <ReplicaTranscriptBridge />
      <CallStage />
    </DailyProvider>
  );
}
