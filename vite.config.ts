import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { deepFlag, emailSignupFlag } from './shared/flags';
import { canonicalOrigin } from './shared/site';
import type { WordDetailKey } from './src/types';

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

/**
 * Word data in two parts, so the first-paint bundle doesn't grow with the word count:
 * `words.json?core` is every word without its examples, etymology, root and syllables (src/lib/words.ts),
 * and `words.json?details` is those fields by slug (src/lib/wordDetails.ts, imported only by lazy chunks).
 * A plain import of words.json is the whole file, as before (tests, tools).
 */
export const DETAIL_KEYS = ['examples', 'etymology', 'root', 'syllables'] as const satisfies readonly WordDetailKey[];
export const splitWords = (): Plugin => ({
  name: 'durar-split-words',
  enforce: 'pre',
  load(id) {
    const [path, query = ''] = id.replace(/\\/g, '/').split('?');
    const params = new URLSearchParams(query);
    const part = params.has('core') ? false : params.has('details') ? true : null;
    if (part === null || !path.endsWith('/src/data/words.json')) return null;
    const words = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>[];
    const pick = (w: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(w).filter(([k]) => (DETAIL_KEYS as readonly string[]).includes(k) === part));
    return JSON.stringify(part ? Object.fromEntries(words.map((w) => [w.slug as string, pick(w)])) : words.map(pick));
  },
});
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), cleanUrls(), slimTopics(), splitWords()],
  define: {
    __EMAIL_SIGNUP__: JSON.stringify(emailSignupFlag(process.env)),
    __DEEP__: JSON.stringify(deepFlag(process.env)),
    __SITE_ORIGIN__: JSON.stringify(canonicalOrigin(process.env)),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
