// The standalone 3D Citadel of Aleppo (/aleppo). It is built on its own, after the main build,
// so it shares no chunks with the sea of pearls and leaves that page's loading exactly as it was.
// `npm run dev` serves it too, at /aleppo.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: { input: fileURLToPath(new URL('./aleppo.html', import.meta.url)) },
  },
});
