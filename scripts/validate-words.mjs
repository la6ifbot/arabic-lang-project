// Validates src/data/words.json, topics.json and illustrations.json (rules in scripts/lib/word-schema.mjs
// and scripts/lib/illustration-schema.mjs).
import { readFileSync } from 'node:fs';
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

if (warnings.length) console.warn(warnings.map((m) => `warning: ${m}`).join('\n'));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`✓ ${words.length} words, ${topics.length} topics and ${illustrations.length} illustrations valid`);
