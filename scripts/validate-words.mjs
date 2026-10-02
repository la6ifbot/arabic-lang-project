// Validates src/data/words.json and src/data/topics.json (rules in scripts/lib/word-schema.mjs).
import { readFileSync } from 'node:fs';
import { validateTopics, validateWords } from './lib/word-schema.mjs';

const read = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'));
const words = read('words.json');
const topics = read('topics.json');

const t = validateTopics(topics);
const w = validateWords(words, topics);
const errors = [...t.errors, ...w.errors];
const warnings = [...t.warnings, ...w.warnings];

if (warnings.length) console.warn(warnings.map((m) => `warning: ${m}`).join('\n'));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`✓ ${words.length} words and ${topics.length} topics valid`);
