// Single source of truth for the design system. tokens.json is consumed by
// tailwind.config.cjs (for the CSS-var glue) and here (via import) so
// Tailwind classes, Monaco, and xterm all derive from the same palette.
//
// The CSS custom properties Tailwind reads at runtime live in index.css and
// must be kept in sync with the hex values below by hand — there is no build
// step generating one from the other.
import tokensJson from './tokens.json';

export type ThemeName = 'dark' | 'light';
export type Tokens = typeof tokensJson.dark;

export const tokens: Record<ThemeName, Tokens> = tokensJson;

/** Back-compat default: the dark palette, for call sites that don't care about theme. */
export const t = tokens.dark;

/**
 * Register both Monaco themes ('ana-dark' / 'ana-light'). Idempotent — cheap
 * to call from every editor's `beforeMount`. Monaco only accepts hex colors
 * (hex8 for alpha), never rgba() strings.
 */
export function defineAnaMonacoTheme(monaco: {
  editor: {
    defineTheme: (
      name: string,
      theme: {
        base: string;
        inherit: boolean;
        rules: unknown[];
        colors: Record<string, string>;
      },
    ) => void;
  };
}): void {
  monaco.editor.defineTheme('ana-dark', monacoTheme('dark'));
  monaco.editor.defineTheme('ana-light', monacoTheme('light'));
}

function monacoTheme(theme: ThemeName): {
  base: string;
  inherit: boolean;
  rules: unknown[];
  colors: Record<string, string>;
} {
  const p = tokens[theme];
  const isDark = theme === 'dark';
  return {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': p.surface.base,
      'editor.foreground': p.text.primary,
      'editorLineNumber.foreground': p.text.tertiary,
      'editorLineNumber.activeForeground': p.text.secondary,
      'editor.selectionBackground': isDark ? '#3B82F640' : '#2563EB30',
      'editor.lineHighlightBackground': p.surface.raised,
      'editorWidget.background': p.surface.modal,
      'editorWidget.border': p.surface.border,
      'editorGutter.background': p.surface.base,
      'diffEditor.insertedTextBackground': isDark ? '#34D39918' : '#05966918',
      'diffEditor.removedTextBackground': isDark ? '#F8717118' : '#DC262618',
      'scrollbarSlider.background': isDark ? '#26262E80' : '#CFCFD880',
      'scrollbarSlider.hoverBackground': isDark ? '#3A3A45A0' : '#B8B8C2A0',
    },
  };
}

/** xterm.js theme derived from the current app theme (plus a tuned ANSI-16 set). */
export function getXtermTheme(theme: ThemeName): {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
} {
  const p = tokens[theme];
  return {
    background: p.surface.base,
    foreground: p.text.primary,
    cursor: p.accent.primary,
    cursorAccent: p.surface.base,
    selectionBackground:
      theme === 'dark' ? 'rgba(59,130,246,0.25)' : 'rgba(37,99,235,0.18)',
  };
}
