// Validates src/data/words.json, topics.json and illustrations.json (rules in scripts/lib/word-schema.mjs
// and scripts/lib/illustration-schema.mjs), and runs every headword through the anatomy of a word
// (shared/anatomy.ts; run with tsx, which loads TypeScript).
import { readFileSync } from 'node:fs';
import { anatomy } from '../shared/anatomy.ts';
import { validateIllustrations } from './lib/illustration-schema.mjs';
import { validateTopics, validateWords } from './lib/word-schema.mjs';

const read = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'));
const words = read('words.json');
const topics = read('topics.json');
const illustrations = read('illustrations.json');

const t = validateTopics(topics);
const w = validateWords(words, topics);
const il = validateIllustrations(illustrations, words, topics);
const errors = [...t.errors, ...w.errors, ...il.errors];
const warnings = [...t.warnings, ...w.warnings, ...il.warnings];

// Anatomy: every headword must break into known letters; words whose automatic syllables are a
// guess are listed for the native-speaker review (an optional `syllables` field settles them).
const review = [];
for (const word of words) {
  const a = anatomy(word);
  for (const e of a.errors) errors.push(`${word.slug}: anatomy: ${e}`);
  if (a.uncertain.length) review.push(`  ${word.slug} ${word.ar} → ${a.syllables.map((s) => s.tr).join(' · ')} (${a.uncertain.join('; ')})`);
}
if (review.length) warnings.push(`anatomy: ${review.length} word${review.length === 1 ? '' : 's'} with syllables to check in the review:\n${review.join('\n')}`);

if (warnings.length) console.warn(warnings.map((m) => `warning: ${m}`).join('\n'));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`✓ ${words.length} words, ${topics.length} topics and ${illustrations.length} illustrations valid`);
