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
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
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
