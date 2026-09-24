// Validates src/data/words.json against Durar's word schema.
import { readFileSync } from 'node:fs';

const words = JSON.parse(readFileSync(new URL('../src/data/words.json', import.meta.url), 'utf8'));
const errors = [];
const slugs = new Set();
const ARABIC = /[؀-ۿ]/;

words.forEach((w, i) => {
  const at = `#${i} (${w.slug ?? '?'})`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(w.slug ?? '')) errors.push(`${at}: slug must be lowercase ascii kebab-case`);
  if (slugs.has(w.slug)) errors.push(`${at}: duplicate slug`);
  slugs.add(w.slug);
  if (!ARABIC.test(w.ar ?? '')) errors.push(`${at}: ar must contain Arabic`);
  if (!w.translit) errors.push(`${at}: missing translit`);
  if (!Array.isArray(w.meanings) || w.meanings.length === 0) errors.push(`${at}: needs at least one meaning`);
  if (!Array.isArray(w.examples) || w.examples.length < 1 || w.examples.length > 3)
    errors.push(`${at}: needs 1–3 examples`);
  for (const ex of w.examples ?? []) {
    if (!ARABIC.test(ex.ar ?? '') || !ex.en) errors.push(`${at}: example needs ar + en`);
  }
  if (w.tags && !Array.isArray(w.tags)) errors.push(`${at}: tags must be an array`);
  // New words must say when they were added, so Pearl of the Day can add them to future cycles
  // without changing days that were already shown (see shared/pearlOfTheDay.ts).
  if (w.added !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(w.added) || w.added < '2026-09-24'))
    errors.push(`${at}: added must be an ISO date on or after 2026-09-24`);
});

if (words.length < 100 || words.length > 300) errors.push(`expected 100–300 words, found ${words.length}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`✓ ${words.length} words valid`);
