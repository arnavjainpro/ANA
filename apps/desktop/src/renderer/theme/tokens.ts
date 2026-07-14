// Single source of truth for the design system. tokens.json is consumed by
// tailwind.config.cjs (via require) and here (via import) so Tailwind classes,
// Monaco, and xterm all derive from the same palette.
import tokens from './tokens.json';

export const t = tokens;

export type Tokens = typeof tokens;

/**
 * Register the app's Monaco theme. Call from the editor's `beforeMount`.
 * Monaco only accepts hex colors (hex8 for alpha) — never rgba() strings.
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
  monaco.editor.defineTheme('ana-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': t.surface.base,
      'editor.foreground': t.text.primary,
      'editorLineNumber.foreground': t.text.tertiary,
      'editorLineNumber.activeForeground': t.text.secondary,
      'editor.selectionBackground': '#3B82F640',
      'editor.lineHighlightBackground': t.surface.raised,
      'editorWidget.background': t.surface.modal,
      'editorWidget.border': t.surface.border,
      'editorGutter.background': t.surface.base,
      'diffEditor.insertedTextBackground': '#34D39918',
      'diffEditor.removedTextBackground': '#F8717118',
      'scrollbarSlider.background': '#26262E80',
      'scrollbarSlider.hoverBackground': '#3A3A45A0',
    },
  });
}

/** xterm.js theme derived from the same tokens (plus a tuned ANSI-16 set). */
export const xtermTheme = {
  background: t.surface.base,
  foreground: t.text.primary,
  cursor: t.accent.primary,
  cursorAccent: t.surface.base,
  selectionBackground: 'rgba(59,130,246,0.25)',
} as const;
