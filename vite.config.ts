import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { emailSignupFlag } from './shared/flags';
import { canonicalOrigin } from './shared/site';

/**
 * `vite preview` parity with Vercel: a file is served as is, /word/x serves dist/word/x/index.html
 * (clean URLs), and any other path gets dist/404.html with a 404 status (no SPA fallback).
 */
const cleanUrls = (): Plugin => ({
  name: 'durar-clean-urls',
  configurePreviewServer(server) {
    const dist = resolve(server.config.root, server.config.build.outDir);
    const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
    server.middlewares.use((req, res, next) => {
      const [path, query] = (req.url ?? '/').split(/\?(.*)/s);
      let url: string;
      try {
        url = decodeURIComponent(path);
      } catch {
        url = path;
      }
      const file = join(dist, url);
      if (url.startsWith('/api/') || !(file + sep).startsWith(dist + sep) || isFile(file)) return next();
      if (isFile(join(file, 'index.html'))) {
        req.url = `${path.replace(/\/$/, '')}/index.html${query ? `?${query}` : ''}`;
        return next();
      }
      if (!isFile(join(dist, '404.html'))) return next();
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(readFileSync(join(dist, '404.html')));
    });
  },
});
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), cleanUrls()],
  define: {
    __EMAIL_SIGNUP__: JSON.stringify(emailSignupFlag(process.env)),
    __SITE_ORIGIN__: JSON.stringify(canonicalOrigin(process.env)),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
