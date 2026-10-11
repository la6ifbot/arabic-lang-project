import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { emailSignupFlag } from './shared/flags';
import { canonicalOrigin } from './shared/site';

/**
 * `vite preview` parity with Vercel: a file is served as is, /word/x serves dist/word/x/index.html
 * (clean URLs), and any other path gets dist/404.html with a 404 status (no SPA fallback). Every
 * response carries vercel.json's site-wide headers, so the browser tests run under the same
 * Content-Security-Policy as durar.space.
 */
const cleanUrls = (): Plugin => ({
  name: 'durar-clean-urls',
  configurePreviewServer(server) {
    const dist = resolve(server.config.root, server.config.build.outDir);
    const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
    const vercel = JSON.parse(readFileSync(resolve(server.config.root, 'vercel.json'), 'utf8')) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    const siteWide = vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
    server.middlewares.use((req, res, next) => {
      for (const { key, value } of siteWide) res.setHeader(key, value);
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

/** The site only needs topic names; the descriptions are for topic pages (prerendered) and tools. */
const slimTopics = (): Plugin => ({
  name: 'durar-slim-topics',
  enforce: 'pre',
  load(id) {
    if (!id.replace(/\\/g, '/').endsWith('/src/data/topics.json')) return null;
    const topics = JSON.parse(readFileSync(id, 'utf8')) as { description?: unknown }[];
    return JSON.stringify(topics.map(({ description: _drop, ...t }) => t));
  },
});
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), cleanUrls(), slimTopics()],
  define: {
    __EMAIL_SIGNUP__: JSON.stringify(emailSignupFlag(process.env)),
    __SITE_ORIGIN__: JSON.stringify(canonicalOrigin(process.env)),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
