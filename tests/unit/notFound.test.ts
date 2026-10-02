import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

test('unknown paths reach Vercel’s 404 page: no catch-all rewrite', () => {
  // Every app route is prerendered (scripts/prerender.mjs), so a rewrite to /index.html would only
  // turn real 404s into a 200 sea. Vercel serves dist/404.html with a 404 status instead.
  expect(vercel.rewrites ?? []).toEqual([]);
  expect(vercel.routes).toBeUndefined();
});
