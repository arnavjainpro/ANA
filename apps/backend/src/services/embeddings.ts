import OpenAI from 'openai';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import { currentOwner } from '../lib/usageContext.js';
import { recordUsage } from './usage.js';

let openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (openai) return openai;
  if (!env.openai.apiKey) {
    throw new AppError(500, 'OPENAI_NOT_CONFIGURED', 'OPENAI_API_KEY is not set.');
  }
  openai = new OpenAI({ apiKey: env.openai.apiKey, timeout: 60_000, maxRetries: 2 });
  return openai;
}

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIM = 1536;

/** Embed a batch of strings. Order of output matches order of input. */
export async function embedBatch(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs,
  });
  recordUsage(currentOwner(), 'embedding_tokens', res.usage?.total_tokens ?? 0, {
    model: EMBEDDING_MODEL,
    inputs: inputs.length,
  });
  return res.data.map((d) => d.embedding);
}

/** Embed a single query string. */
export async function embedQuery(input: string): Promise<number[]> {
  const [vector] = await embedBatch([input]);
  if (!vector) {
    throw new AppError(502, 'EMBEDDING_FAILED', 'Embedding API returned no vector.');
  }
  return vector;
}
