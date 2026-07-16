/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand values mirrored from apps/desktop/src/renderer/theme/tokens.json
        accent: { DEFAULT: '#3B82F6', hover: '#2563EB', soft: '#EFF6FF' },
        ink: { DEFAULT: '#111114', secondary: '#4B4B55', tertiary: '#6E6E78' },
        paper: { DEFAULT: '#FFFFFF', tint: '#F5F7FA', card: '#EEF1F5', cream: '#FBF4EC' },
        dark: {
          base: '#0D0D0F',
          raised: '#131316',
          border: '#2A2A32',
          text: '#EDEDF0',
          textDim: '#A2A2AC',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        hero: '2.5rem',
        band: '3rem',
      },
      maxWidth: {
        site: '96rem',
      },
      transitionTimingFunction: {
        emphasized: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
