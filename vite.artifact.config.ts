// Single-file build for sandboxed previews (e.g. a claude.ai artifact): JS, CSS and fonts are
// inlined into one HTML file and URL rewriting is disabled. Production uses vite.config.ts.
import { defineConfig, mergeConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import base from './vite.config';

export default mergeConfig(
  base,
  defineConfig({
    base: './',
    plugins: [viteSingleFile()],
    // Embedded: leave the URL alone. Accounts run as a browser-only demo (no backend to reach).
    define: {
      'import.meta.env.VITE_EMBEDDED': JSON.stringify('1'),
      'import.meta.env.VITE_BACKEND': JSON.stringify('mock'),
    },
    build: { outDir: 'dist-artifact', assetsInlineLimit: 100_000_000, cssCodeSplit: false },
  }),
);
