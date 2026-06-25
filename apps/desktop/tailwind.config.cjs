/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cursor-inspired professional black/white palette, now anchored by the
        // indigo brand accent shared with the diagram design system below.
        ana: {
          bg: '#0a0a0a',        // Pure black background
          panel: '#141415',      // Slightly lighter for panels/sidebars
          border: '#2a2a2a',     // Subtle borders
          accent: '#ffffff',     // White — reserved for high-emphasis text
          text: '#e0e0e0',       // Off-white text
          'text-muted': '#888888', // Muted gray
          hover: '#1a1a1a',      // Hover state
          // Blue brand accent (mirrors accent.primary) — primary CTAs, the
          // active nav indicator, focus rings, and brand marks.
          brand: '#3B82F6',
          'brand-hover': '#2563EB',
          'brand-soft': 'rgba(59,130,246,0.12)',
          'brand-border': 'rgba(59,130,246,0.4)',
        },
        // Canonical design-system tokens (diagram panel + going forward).
        surface: {
          base: '#0D0D0F',    // app background
          raised: '#131316',  // panel background
          overlay: '#1A1A1F', // card / node background
          border: '#2A2A32',  // all borders
        },
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
        accent: {
          primary: '#3B82F6', // blue — Ana brand color
          glow: 'rgba(59,130,246,0.15)',
        },
      },
      boxShadow: {
        node: '0 0 0 1px var(--tw-shadow-color), 0 4px 24px -4px var(--tw-shadow-color)',
        panel: '0 0 40px -8px rgba(59,130,246,0.08)',
        'glow-sm': '0 0 12px rgba(59,130,246,0.3)',
        // Brand glow for the active nav indicator + primary buttons.
        glow: '0 0 0 1px rgba(59,130,246,0.4), 0 4px 16px -2px rgba(59,130,246,0.4)',
        'glow-strong': '0 0 0 1px rgba(59,130,246,0.5), 0 6px 24px -4px rgba(59,130,246,0.55)',
        // Soft elevation for raised chrome (top bar, composer, cards).
        elevate: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.7)',
        'focus-brand': '0 0 0 1px rgba(59,130,246,0.6), 0 0 0 4px rgba(59,130,246,0.15)',
      },
      backgroundImage: {
        'brand-sheen': 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 100%)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scale-in 0.18s cubic-bezier(0.16,1,0.3,1) both',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
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
      },
    },
  },
  plugins: [],
};
