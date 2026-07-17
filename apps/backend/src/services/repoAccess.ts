import { getSupabase } from '../db/client.js';
import { AppError } from '../lib/errors.js';

/**
 * Authorization gate for client-supplied repo ids. Every route that accepts a
 * repoId must call this before any retrieval or file access happens, so one
 * tenant can never read another tenant's indexed code.
 *
 * Rows indexed before tenancy existed have owner_id = '' and stay readable by
 * any authenticated caller until re-indexed under an owner.
 */
export async function assertRepoOwner(repoId: string, ownerId: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from('repos')
    .select('owner_id')
    .eq('id', repoId)
    .maybeSingle();

  if (error) {
    // Pre-migration database (001_tenancy.sql not applied yet): no owner_id
    // column means no per-tenant rows exist either, so treat as legacy-open
    // rather than breaking every turn.
    if (error.message.includes('owner_id')) return;
    throw new AppError(500, 'DB_READ_FAILED', `Could not verify repo access: ${error.message}`);
  }
  if (!data) {
    throw new AppError(404, 'REPO_NOT_FOUND', 'That repository has not been indexed.');
  }
  const rowOwner = (data.owner_id as string) ?? '';
  if (rowOwner !== '' && rowOwner !== ownerId) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to that repository.');
  }
}
