import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';

let client: SupabaseClient | null = null;

/**
 * Singleton Supabase client using the service-role key. This key has full
 * database access and must never leave the backend.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!env.supabase.url || !env.supabase.serviceKey) {
    throw new AppError(
      500,
      'SUPABASE_NOT_CONFIGURED',
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.',
    );
  }
  client = createClient(env.supabase.url, env.supabase.serviceKey, {
    auth: { persistSession: false },
  });
  return client;
}
