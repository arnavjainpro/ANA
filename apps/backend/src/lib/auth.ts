import jwt from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';
import { env } from './env.js';
import { AppError } from './errors.js';

export interface SessionClaims {
  /** Stable GitHub user id (numeric, stringified). Tenant key for all data. */
  sub: string;
  login: string;
}

/** Issue a session JWT after a successful GitHub OAuth exchange. */
export function issueSessionToken(claims: SessionClaims): string {
  return jwt.sign(claims, env.jwtSecret, { expiresIn: '12h' });
}

/** Verify a session JWT and return its claims. Throws AppError(401) on failure. */
export function verifySessionToken(token: string): SessionClaims {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      throw new Error('malformed claims');
    }
    return { sub: decoded.sub, login: String(decoded['login'] ?? decoded.sub) };
  } catch {
    throw new AppError(401, 'INVALID_SESSION', 'Session expired or invalid. Reconnect GitHub.');
  }
}

/** Extract and verify the Bearer session token from a request. */
export function sessionFrom(req: FastifyRequest): SessionClaims {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith('Bearer ')) {
    throw new AppError(401, 'NO_SESSION', 'Missing Authorization header. Reconnect GitHub.');
  }
  return verifySessionToken(value.slice('Bearer '.length));
}

/** Read the GitHub access token from the request header. */
export function githubTokenFrom(req: FastifyRequest): string {
  const header = req.headers['x-github-token'];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) {
    throw new AppError(401, 'NO_GITHUB_TOKEN', 'Missing x-github-token header.');
  }
  return token;
}
