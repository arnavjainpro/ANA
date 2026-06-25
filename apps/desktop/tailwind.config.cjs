/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cursor-inspired professional black/white palette
        ana: {
          bg: '#0a0a0a',        // Pure black background
          panel: '#141415',      // Slightly lighter for panels/sidebars
          border: '#2a2a2a',     // Subtle borders
          accent: '#ffffff',     // White for primary accents
          text: '#e0e0e0',       // Off-white text
          'text-muted': '#888888', // Muted gray
          hover: '#1a1a1a',      // Hover state
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
          active: '#6366F1',
          label: '#6B7280',
        },
        accent: {
          primary: '#6366F1', // indigo — Ana brand color
          glow: 'rgba(99,102,241,0.15)',
        },
      },
      boxShadow: {
        node: '0 0 0 1px var(--tw-shadow-color), 0 4px 24px -4px var(--tw-shadow-color)',
        panel: '0 0 40px -8px rgba(99,102,241,0.08)',
        'glow-sm': '0 0 12px rgba(99,102,241,0.3)',
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
