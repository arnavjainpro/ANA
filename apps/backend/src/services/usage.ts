import { getSupabase } from '../db/client.js';

export type UsageKind = 'claude_tokens' | 'embedding_tokens' | 'tavus_conversation';

/**
 * Record one billable event. Fire-and-forget: metering must never fail or slow
 * a user-facing request, so errors are logged and swallowed. Rows land in the
 * usage_events table keyed by owner for later aggregation and billing.
 */
export function recordUsage(
  ownerId: string,
  kind: UsageKind,
  quantity: number,
  meta?: Record<string, unknown>,
): void {
  void (async () => {
    try {
      await getSupabase()
        .from('usage_events')
        .insert({ owner_id: ownerId, kind, quantity, meta: meta ?? null });
    } catch (err) {
      console.warn('[usage] record failed:', err instanceof Error ? err.message : err);
    }
  })();
}
