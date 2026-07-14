const t = require('./src/renderer/theme/tokens.json');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic design tokens — single source of truth in theme/tokens.json.
        // Four elevation levels: base (workspace/editor/diagram/terminal),
        // raised (chrome: sidebar, top bar, panel headers), overlay (nested
        // cards/rows/inputs), modal (command palette, popovers).
        surface: {
          base: t.surface.base,
          raised: t.surface.raised,
          overlay: t.surface.overlay,
          modal: t.surface.modal,
          border: t.surface.border,
          'border-strong': t.surface.borderStrong,
          hover: t.surface.hover,
          active: t.surface.active,
        },
        text: {
          primary: t.text.primary,
          secondary: t.text.secondary,
          tertiary: t.text.tertiary,
          disabled: t.text.disabled,
        },
        accent: {
          primary: t.accent.primary,
          hover: t.accent.hover,
          muted: t.accent.muted,
          border: t.accent.border,
          glow: t.accent.glow,
        },
        status: {
          success: t.status.success,
          'success-muted': t.status.successMuted,
          warning: t.status.warning,
          'warning-muted': t.status.warningMuted,
          danger: t.status.danger,
          'danger-muted': t.status.dangerMuted,
        },
        // Diagram domain colors (Understand panel node/edge typing) — not part
        // of the elevation system, intentionally kept separate.
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
        // TEMPORARY migration aliases (Phase 1 → deleted in Phase 7). Every
        // legacy ana-* class resolves to the new semantic palette so the whole
        // app re-skins before per-file migration.
        ana: {
          bg: t.surface.base,
          panel: t.surface.raised,
          border: t.surface.border,
          text: t.text.primary,
          'text-muted': t.text.secondary,
          hover: t.surface.hover,
          brand: t.accent.primary,
          'brand-hover': t.accent.hover,
          'brand-soft': t.accent.muted,
          'brand-border': t.accent.border,
        },
      },
      boxShadow: {
        node: '0 0 0 1px var(--tw-shadow-color), 0 4px 24px -4px var(--tw-shadow-color)',
        // Elevation ramp: quiet drop shadows, no coloured halos.
        raised: '0 1px 2px rgba(0,0,0,0.4)',
        overlay: '0 4px 16px -4px rgba(0,0,0,0.5)',
        modal: `0 0 0 1px ${t.surface.border}, 0 16px 48px -12px rgba(0,0,0,0.7)`,
        'glow-strong': '0 2px 8px -2px rgba(0,0,0,0.5)',
        elevate: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.7)',
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
