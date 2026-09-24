import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { emailSignupFlag } from './shared/flags';
import { canonicalOrigin } from './shared/site';

/** `vite preview` parity with Vercel/Netlify clean URLs: /word/x → dist/word/x/index.html, etc. */
const cleanUrls = (): Plugin => ({
  name: 'durar-clean-urls',
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url?.split('?')[0] ?? '';
      if (/^\/(word\/[a-z0-9-]+|library|privacy|subscribe\/confirm|unsubscribe)\/?$/.test(url)) {
        const file = join(server.config.build.outDir, url, 'index.html');
        if (existsSync(join(server.config.root, file))) req.url = `${url.replace(/\/$/, '')}/index.html`;
      }
      next();
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
