// Single source of truth for the design system. tokens.json is consumed by
// tailwind.config.cjs (via require) and here (via import) so Tailwind classes,
// Monaco, and xterm all derive from the same palette.
import tokens from './tokens.json';

export const t = tokens;

export type Tokens = typeof tokens;
