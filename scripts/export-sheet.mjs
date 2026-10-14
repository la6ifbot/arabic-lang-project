// Writes the current words and topics as CSV files to import into the Google Sheet (docs/CONTENT.md):
// once to fill a new Sheet, and again whenever words reach the repo without going through the Sheet.
//
//   node scripts/export-sheet.mjs [out-dir]     default: sheet-export/
//   node scripts/export-sheet.mjs out --only slug1,slug2   just these words, without the header row, as
//        durar-new-rows.csv (File > Import > Upload > Append to current sheet)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { toCsv, topicsToRows, wordsToRows } from './lib/sheet.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { only: { type: 'string' } } });
const dir = positionals[0] ?? 'sheet-export';
const read = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'));
let words = read('words.json');
if (values.only) {
  const only = new Set(values.only.split(','));
  words = words.filter((w) => only.has(w.slug));
}
mkdirSync(dir, { recursive: true });
if (values.only) {
  writeFileSync(join(dir, 'durar-new-rows.csv'), toCsv(wordsToRows(words).slice(1)));
  console.log(`Wrote ${words.length} rows to ${dir}/durar-new-rows.csv`);
} else {
  writeFileSync(join(dir, 'durar-words.csv'), toCsv(wordsToRows(words)));
  writeFileSync(join(dir, 'durar-topics.csv'), toCsv(topicsToRows(read('topics.json'))));
  console.log(`Wrote ${words.length} words and the topics to ${dir}/durar-words.csv and ${dir}/durar-topics.csv`);
}
