import type { FastifyReply } from 'fastify';
import type { ApiError } from './types.js';

/** A backend error that carries an HTTP status and a stable machine code. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Translate any thrown value into a `{ error, code }` body + status. */
export function sendError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof AppError) {
    const body: ApiError = { error: err.message, code: err.code };
    return reply.status(err.statusCode).send(body);
  }
  const message = err instanceof Error ? err.message : 'Unknown server error';
  const body: ApiError = { error: message, code: 'INTERNAL_ERROR' };
  return reply.status(500).send(body);
}
