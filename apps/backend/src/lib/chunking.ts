/**
 * MVP chunking: a 512-token sliding window with 64-token overlap.
 *
 * Tree-sitter / AST-aware chunking is explicitly out of scope for now (see
 * spec §7). We approximate tokens as whitespace-delimited words, which is
 * adequate for retrieval-quality chunking without pulling in a tokenizer.
 */

const WINDOW_TOKENS = 512;
const OVERLAP_TOKENS = 64;

export interface TextChunk {
  index: number;
  content: string;
}

export function chunkText(text: string): TextChunk[] {
  const tokens = text.split(/(\s+)/).filter((t) => t.length > 0);
  // Recombine while counting only non-whitespace tokens toward the window.
  const words: string[] = [];
  for (const t of tokens) {
    words.push(t);
  }

  // Build a list of indices that are "real" words (non-whitespace) so we can
  // step the window by token count while preserving original spacing.
  const wordPositions: number[] = [];
  words.forEach((t, i) => {
    if (!/^\s+$/.test(t)) wordPositions.push(i);
  });

  if (wordPositions.length === 0) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let chunkIndex = 0;
  const step = WINDOW_TOKENS - OVERLAP_TOKENS;

  while (start < wordPositions.length) {
    const end = Math.min(start + WINDOW_TOKENS, wordPositions.length);
    const sliceStart = wordPositions[start]!;
    const sliceEnd =
      end < wordPositions.length ? wordPositions[end]! : words.length;
    const content = words.slice(sliceStart, sliceEnd).join('').trim();
    if (content.length > 0) {
      chunks.push({ index: chunkIndex, content });
      chunkIndex += 1;
    }
    if (end >= wordPositions.length) break;
    start += step;
  }

  return chunks;
}
