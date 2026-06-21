import type { IpcResult } from '../../types';

/** Narrow an IpcResult to its error case. */
export function isIpcError<T>(result: IpcResult<T>): result is { error: string } {
  return typeof result === 'object' && result !== null && 'error' in result;
}
