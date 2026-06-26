/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cursor-inspired professional palette: layered cool-neutral grays
        // (lifted off pure black) with a single restrained blue accent.
        ana: {
          bg: '#1a1a1d',          // Workspace / editor surface (the lighter base)
          panel: '#141417',       // Bars + sidebar (darker, like an activity bar)
          border: '#2a2a30',      // Soft, low-contrast hairline borders
          accent: '#ffffff',      // White — reserved for high-emphasis text
          text: '#e4e4e7',        // Near-white primary text (cool)
          'text-muted': '#8a8a93', // Muted cool gray
          hover: '#232329',       // Subtle hover fill
          // Blue brand accent (mirrors accent.primary) — used sparingly for the
          // active nav indicator, primary CTAs, and focus rings. No glow.
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
        panel: 'none',
        // Subtle, non-glowing elevation. Cursor leans on flat fills + hairline
        // borders rather than coloured halos, so these are quiet drop shadows.
        'glow-sm': 'none',
        glow: 'none',
        'glow-strong': '0 2px 8px -2px rgba(0,0,0,0.5)',
        // Soft elevation for raised chrome (top bar, composer, cards).
        elevate: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.7)',
        // Functional focus ring (kept for keyboard accessibility), softened.
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
      },
    },
  },
  plugins: [],
};
