import jwt from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';
import { env } from './env.js';
import { AppError } from './errors.js';

interface SessionClaims {
  sub: string; // GitHub login
  name: string;
}

/** Issue a short-lived session JWT after a successful GitHub OAuth exchange. */
export function issueSessionToken(claims: SessionClaims): string {
  return jwt.sign(claims, env.jwtSecret, { expiresIn: '12h' });
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
