// After `npm run build`: the JavaScript a first visit downloads before any lazy chunk (dist/index.html's
// entry script and its modulepreloads) must stay within budget, and must not carry the word details
// (examples, etymologies), which load on demand from src/lib/wordDetails.ts. Prints the sizes either way.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** gzip kB. 120.9 with 300 words before the split (Phase 0.7); raise it on purpose, never to fit. */
const BUDGET_GZ_KB = 120;

const dist = join(import.meta.dirname, '..', 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const firstPaint = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
if (!firstPaint.length) throw new Error('No entry script in dist/index.html: run `npm run build` first.');

const kB = (n) => (n / 1000).toFixed(1);
const gz = (b) => gzipSync(b, { level: 9 }).length;
const words = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src/data/words.json'), 'utf8'));
// English example sentences that survive minification as they are (plain ASCII, no quotes or escapes).
const probes = words.flatMap((w) => w.examples.map((e) => e.en)).filter((s) => /^[A-Za-z ,.]{20,}$/.test(s));

let raw = 0;
let zipped = 0;
const leaks = [];
for (const f of firstPaint) {
  const b = readFileSync(join(dist, f));
  raw += b.length;
  zipped += gz(b);
  console.log(`first paint  ${f}  ${kB(b.length)} kB, ${kB(gz(b))} kB gzip`);
  const text = b.toString('utf8');
  if (probes.some((p) => text.includes(p))) leaks.push(f);
}
for (const f of readdirSync(join(dist, 'assets')).filter((f) => f.startsWith('wordDetails-') && f.endsWith('.js'))) {
  const b = readFileSync(join(dist, 'assets', f));
  console.log(`on demand    assets/${f}  ${kB(b.length)} kB, ${kB(gz(b))} kB gzip (${words.length} words' details)`);
}
console.log(`first-paint JS: ${kB(raw)} kB, ${kB(zipped)} kB gzip (budget ${BUDGET_GZ_KB} kB gzip)`);

let failed = false;
if (leaks.length) {
  failed = true;
  console.error(`Word examples are in the first-paint JS (${leaks.join(', ')}). Import word details only through src/lib/wordDetails.ts.`);
}
if (zipped / 1000 > BUDGET_GZ_KB) {
  failed = true;
  console.error(`First-paint JS is over budget: move new code behind import(), or raise BUDGET_GZ_KB in scripts/check-bundle.mjs on purpose.`);
}
if (!probes.length) {
  failed = true;
  console.error('No example sentence to look for: update the probe filter in scripts/check-bundle.mjs.');
}
process.exit(failed ? 1 : 0);
