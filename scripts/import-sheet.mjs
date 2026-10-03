// Imports the Google Sheet into src/data/words.json and src/data/topics.json (Phase 0.6, section G).
// The "Import from the Sheet" workflow runs it and opens a pull request with the summary; it also
// runs locally on downloaded CSV files. How to use the Sheet: docs/CONTENT.md.
//
//   node scripts/import-sheet.mjs --words <csv url or file> [--topics <csv url or file>]
//        [--allow-removals] [--summary summary.md] [--check]
//
// Exit codes: 0 written (or nothing to change), 1 invalid rows, 2 removals that were not allowed.
// Nothing is written unless every row is valid. --check validates and summarises without writing.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { formatWords } from './migrate-tags-to-topics.mjs';
import { diffById, parseCsv, rowsToTopics, rowsToWords } from './lib/sheet.mjs';
import { validateTopics, validateWords } from './lib/word-schema.mjs';

const formatTopics = (topics) => `${JSON.stringify(topics, null, 2)}\n`;

async function load(source) {
  if (/^https:\/\//.test(source)) {
    const res = await fetch(source, { redirect: 'follow' });
    if (!res.ok) throw new Error(`could not download ${source}: HTTP ${res.status}`);
    const text = await res.text();
    if (/^\s*<!doctype html|^\s*<html/i.test(text))
      throw new Error(`${source} returned a web page, not CSV. Use the "Publish to web" CSV link (docs/CONTENT.md).`);
    return text;
  }
  return readFileSync(source, 'utf8');
}

/**
 * The whole import as a pure function, so tests can run it on fixture sheets.
 * Returns the new data, what changed, the problems found and a Markdown summary for the PR.
 */
export function importSheet({ wordsCsv, topicsCsv, currentWords, currentTopics, allowRemovals = false }) {
  const t = topicsCsv === undefined ? { topics: currentTopics, errors: [], warnings: [] } : rowsToTopics(parseCsv(topicsCsv));
  const w = rowsToWords(parseCsv(wordsCsv), currentWords);
  const tv = t.errors.length ? { errors: [], warnings: [] } : validateTopics(t.topics);
  // Missing columns leave no words to check; bad cells still let the validator report every other row.
  const wv = w.words.length === 0 || t.errors.length ? { errors: [], warnings: [] } : validateWords(w.words, t.topics);
  const errors = [...t.errors, ...w.errors, ...tv.errors, ...wv.errors];
  if (w.words.length === 0 && w.errors.length === 0) errors.push('words tab has no rows');
  const warnings = [...t.warnings, ...w.warnings, ...tv.warnings, ...wv.warnings];

  const wordDiff = diffById(currentWords, w.words, 'slug');
  const topicDiff = diffById(currentTopics, t.topics, 'id');
  const removals = [...wordDiff.removed.map((x) => `word "${x.slug}"`), ...topicDiff.removed.map((x) => `topic "${x.id}"`)];
  const blockedRemovals = removals.length > 0 && !allowRemovals;
  const changed =
    formatWords(w.words) !== formatWords(currentWords) ||
    (topicsCsv !== undefined && JSON.stringify(t.topics) !== JSON.stringify(currentTopics));

  const summary = summarise({ words: w.words, topics: t.topics, wordDiff, topicDiff, errors, warnings, blockedRemovals });
  return { words: w.words, topics: t.topics, wordDiff, topicDiff, errors, warnings, removals, blockedRemovals, changed, summary };
}

function summarise({ words, topics, wordDiff, topicDiff, errors, warnings, blockedRemovals }) {
  const out = [];
  const line = (s = '') => out.push(s);
  const n = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;
  if (errors.length) {
    line(`**The Sheet has ${n(errors.length, 'problem')}. Nothing was imported.** Fix these rows and run the import again:`);
    line();
    for (const e of errors) line(`- ${e}`);
    return out.join('\n') + '\n';
  }
  line(
    `${n(wordDiff.added.length, 'new word')}, ${n(wordDiff.changed.length, 'changed word')}, ` +
      `${n(wordDiff.removed.length, 'removed word')}. ${n(words.length, 'word')} in total.`,
  );
  if (blockedRemovals) {
    line();
    line('**Removals were not confirmed, so nothing was imported.** If these should go, run the import again with "Allow removals" ticked:');
  }
  if (wordDiff.removed.length) {
    line();
    line('### Removed');
    line('Their `/word/<slug>` links will stop working, and saved pearls of these words disappear from the Library.');
    for (const x of wordDiff.removed) line(`- ${x.ar} \`${x.slug}\``);
  }
  if (topicDiff.removed.length) {
    line();
    line('### Removed topics');
    for (const x of topicDiff.removed) line(`- ${x.name.en} \`${x.id}\``);
  }
  if (wordDiff.added.length) {
    line();
    line('### New');
    for (const x of wordDiff.added) line(`- ${x.ar} \`${x.slug}\`: ${x.meanings[0]} (${x.topics.join(', ') || 'whole sea only'})`);
  }
  if (wordDiff.changed.length) {
    line();
    line('### Changed');
    for (const x of wordDiff.changed) line(`- \`${x.id}\`: ${x.fields.join(', ')}`);
  }
  if (topicDiff.added.length || topicDiff.changed.length) {
    line();
    line('### Topics');
    for (const x of topicDiff.added) line(`- new: ${x.name.en} \`${x.id}\``);
    for (const x of topicDiff.changed) line(`- \`${x.id}\`: ${x.fields.join(', ')}`);
  }
  if (wordDiff.reordered) {
    line();
    line('Rows were reordered (this only changes the order of words in the file).');
  }
  line();
  line('### Words per topic');
  line('| Topic | Words | Not yet reviewed |');
  line('| --- | ---: | ---: |');
  for (const t of [...topics].sort((a, b) => a.order - b.order)) {
    const inTopic = words.filter((w) => w.topics.includes(t.id));
    line(`| ${t.name.en} | ${inTopic.length} | ${inTopic.filter((w) => w.status !== 'reviewed').length} |`);
  }
  const drafts = words.filter((w) => w.status !== 'reviewed');
  line(`| **The whole sea** | **${words.length}** | **${drafts.length}** |`);
  if (warnings.length) {
    line();
    line('### Warnings');
    for (const x of warnings) line(`- ${x}`);
  }
  return out.join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      words: { type: 'string' },
      topics: { type: 'string' },
      'allow-removals': { type: 'boolean', default: false },
      summary: { type: 'string' },
      check: { type: 'boolean', default: false },
    },
  });
  if (!values.words) {
    console.error('usage: node scripts/import-sheet.mjs --words <csv url or file> [--topics <csv>] [--allow-removals] [--summary file] [--check]');
    process.exit(1);
  }
  const wordsUrl = new URL('../src/data/words.json', import.meta.url);
  const topicsUrl = new URL('../src/data/topics.json', import.meta.url);
  const result = importSheet({
    wordsCsv: await load(values.words),
    topicsCsv: values.topics ? await load(values.topics) : undefined,
    currentWords: JSON.parse(readFileSync(wordsUrl, 'utf8')),
    currentTopics: JSON.parse(readFileSync(topicsUrl, 'utf8')),
    allowRemovals: values['allow-removals'],
  });
  if (values.summary) writeFileSync(values.summary, result.summary);
  console.log(result.summary);
  if (result.errors.length) process.exit(1);
  if (result.blockedRemovals) process.exit(2);
  if (!values.check && result.changed) {
    writeFileSync(wordsUrl, formatWords(result.words));
    const topicsChanged = values.topics && JSON.stringify(result.topics) !== JSON.stringify(JSON.parse(readFileSync(topicsUrl, 'utf8')));
    if (topicsChanged) writeFileSync(topicsUrl, formatTopics(result.topics));
    console.log('Wrote src/data/words.json' + (topicsChanged ? ' and src/data/topics.json' : ''));
  } else if (!result.changed) console.log('Nothing to change: the Sheet matches the repo.');
}
