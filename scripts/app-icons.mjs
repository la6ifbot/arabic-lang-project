// Draws the installable-app icons in public/icons/ from public/favicon.svg (the pearl), with
// Playwright's Chromium. Run by hand after changing the favicon: `node scripts/app-icons.mjs`.
//   icon-192.png, icon-512.png: the favicon as it is (rounded square), for "any" purpose.
//   maskable-512.png, apple-touch-icon.png (180): full-bleed square; the pearl sits well inside the
//   maskable safe zone (radius 19/64 ≈ 30% of the size, the zone is 40%), so any mask shape keeps it whole.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = join(import.meta.dirname, '..');
const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });
const rounded = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8');
const square = rounded.replace(/ rx="[\d.]+"/, '');
if (square === rounded) throw new Error('favicon.svg has no rounded background rect to square off');

const icons = [
  ['icon-192.png', 192, rounded],
  ['icon-512.png', 512, rounded],
  ['maskable-512.png', 512, square],
  ['apple-touch-icon.png', 180, square],
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [name, size, svg] of icons) {
  await page.setViewportSize({ width: size, height: size });
  const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${sized}`);
  await page.locator('svg').screenshot({ path: join(out, name), omitBackground: true });
  console.log(`public/icons/${name}  ${size}×${size}`);
}
await browser.close();
