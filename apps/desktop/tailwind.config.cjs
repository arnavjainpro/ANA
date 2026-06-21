/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ana: {
          bg: '#0f1117',
          panel: '#1a1d27',
          border: '#2a2e3a',
          accent: '#6366f1',
        },
      },
    },
  },
  plugins: [],
};
