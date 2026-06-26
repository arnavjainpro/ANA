// Lets non-call code (e.g. the voice-Build handler) make Ana speak a line after
// the fact. We send a Tavus "echo" interaction over the Daily data channel, so
// the replica says the given text verbatim. Best-effort: a no-op until a call is
// bound, and never throws.

interface AppMessageSender {
  sendAppMessage: (data: unknown, to?: string) => void;
}

let call: AppMessageSender | null = null;
let conversationId: string | null = null;

export function bindVoice(c: AppMessageSender | null, id: string | null): void {
  call = c;
  conversationId = id;
}

/** Make Ana speak `text` in the active call (Tavus echo interaction). */
export function speakViaTavus(text: string): void {
  if (!call || !conversationId || !text.trim()) return;
  try {
    call.sendAppMessage(
      {
        message_type: 'conversation',
        event_type: 'conversation.echo',
        conversation_id: conversationId,
        properties: { text },
      },
      '*',
    );
  } catch {
    // Best-effort — a failed echo just means no spoken follow-up.
  }
}
