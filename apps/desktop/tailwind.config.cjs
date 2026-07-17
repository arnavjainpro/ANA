// Colors below resolve to CSS custom properties (defined per-theme in
// index.css, switched at runtime via [data-theme] on <html>) rather than
// literal hex, so the whole app can flip dark/light without a rebuild.
// `withOpacity` keeps Tailwind's color-opacity modifiers (e.g. bg-x/50)
// working — the CSS var must hold "R G B" triplets, not a hex string.
function withOpacity(varName) {
  return ({ opacityValue }) =>
    opacityValue === undefined ? `rgb(var(${varName}))` : `rgb(var(${varName}) / ${opacityValue})`;
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic design tokens — CSS vars are the single source of truth,
        // defined per-theme in index.css from theme/tokens.json's values.
        // Four elevation levels: base (workspace/editor/diagram/terminal),
        // raised (chrome: sidebar, top bar, panel headers), overlay (nested
        // cards/rows/inputs), modal (command palette, popovers).
        surface: {
          base: withOpacity('--color-surface-base'),
          raised: withOpacity('--color-surface-raised'),
          overlay: withOpacity('--color-surface-overlay'),
          modal: withOpacity('--color-surface-modal'),
          border: withOpacity('--color-surface-border'),
          'border-strong': withOpacity('--color-surface-border-strong'),
          hover: withOpacity('--color-surface-hover'),
          active: withOpacity('--color-surface-active'),
        },
        text: {
          primary: withOpacity('--color-text-primary'),
          secondary: withOpacity('--color-text-secondary'),
          tertiary: withOpacity('--color-text-tertiary'),
          disabled: withOpacity('--color-text-disabled'),
        },
        accent: {
          primary: withOpacity('--color-accent-primary'),
          hover: withOpacity('--color-accent-hover'),
          muted: 'var(--color-accent-muted)',
          border: 'var(--color-accent-border)',
          glow: 'var(--color-accent-glow)',
        },
        status: {
          success: withOpacity('--color-status-success'),
          'success-muted': 'var(--color-status-success-muted)',
          warning: withOpacity('--color-status-warning'),
          'warning-muted': 'var(--color-status-warning-muted)',
          danger: withOpacity('--color-status-danger'),
          'danger-muted': 'var(--color-status-danger-muted)',
        },
        // Diagram domain colors (Understand panel node/edge typing) — not part
        // of the elevation system, intentionally kept separate and dark-only
        // (the diagram canvas itself is a fixed dark surface either theme).
        node: {
          file: { bg: '#1E2A3A', border: '#3B6FCC', text: '#93C5FD' },
          service: { bg: '#1E2D27', border: '#2D8B5A', text: '#6EE7B7' },
          database: { bg: '#2D1E3A', border: '#7C3AED', text: '#C4B5FD' },
          external: { bg: '#2D2418', border: '#D97706', text: '#FCD34D' },
          entry: { bg: '#2D1E1E', border: '#DC2626', text: '#FCA5A5' },
        },
        edge: {
          default: '#3A3A45',
          active: '#3B82F6',
          label: '#6B7280',
        },
      },
      boxShadow: {
        node: '0 0 0 1px var(--tw-shadow-color), 0 4px 24px -4px var(--tw-shadow-color)',
        // Elevation ramp: quiet drop shadows, no coloured halos.
        raised: '0 1px 2px rgba(0,0,0,0.4)',
        overlay: '0 4px 16px -4px rgba(0,0,0,0.5)',
        modal: '0 0 0 1px rgb(var(--color-surface-border)), 0 16px 48px -12px rgba(0,0,0,0.7)',
        'focus-brand': '0 0 0 1px rgba(59,130,246,0.55)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(3px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.2s ease-out both',
        'scale-in': 'scale-in 0.14s ease-out both',
      },
      transitionTimingFunction: {
        // Snappy, slightly overshooting ease for entering elements.
        emphasized: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['Fira Code', 'Monaco', 'monospace'],
      },
      fontSize: {
        xs: '11px',
        sm: '12px',
        base: '13px',
        lg: '14px',
        xl: '16px',
      },
    },
  },
  plugins: [],
};
