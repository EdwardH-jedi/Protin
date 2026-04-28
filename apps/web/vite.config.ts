import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The Figma Make draft sits at apps/web/Protin Landing Page Design and is a
// separate Vite project we keep around as a visual reference. Exclude it so
// vite/tsc/tailwind never walk into it for the real site build.
const FIGMA_DRAFT = 'Protin Landing Page Design/**';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    fs: {
      // Don't surface the draft folder when Vite serves files.
      deny: [FIGMA_DRAFT],
    },
  },
});
