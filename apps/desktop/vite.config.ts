import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'node:path';

// Builds three targets from one config:
//  - main process     → dist-electron/main/index.js
//  - preload script   → dist-electron/preload/index.js
//  - renderer (React) → dist/
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  // Load .env from the desktop app root (not src/renderer) so renderer flags
  // like VITE_TAVUS_MANUAL_START live alongside the app, not buried in source.
  envDir: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  plugins: [
    react(),
    electron([
      {
        entry: resolve(__dirname, 'src/main/index.ts'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist-electron/main'),
            // simple-git shells out to the git binary and uses dynamic requires,
            // so keep it external (loaded from node_modules) rather than bundled.
            rollupOptions: { external: ['electron', 'simple-git'] },
          },
        },
      },
      {
        entry: resolve(__dirname, 'src/preload/index.ts'),
        onstart(args) {
          // Reload the renderer when the preload script rebuilds.
          args.reload();
        },
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist-electron/preload'),
            rollupOptions: { external: ['electron'] },
          },
        },
      },
    ]),
    renderer(),
  ],
});
