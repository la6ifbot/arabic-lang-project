import { describe, expect, test } from 'vitest';
import words from '../../src/data/words.json';
import topics from '../../src/data/topics.json';
import illustrations from '../../src/data/illustrations.json';
import { importSheet } from '../../scripts/import-sheet.mjs';
import { parseCsv, toCsv, topicsToRows, wordsToRows, WORD_COLUMNS } from '../../scripts/lib/sheet.mjs';
import { formatWords } from '../../scripts/migrate-tags-to-topics.mjs';

const current = { currentWords: words, currentTopics: topics };
/** The Sheet as it would be after importing scripts/export-sheet.mjs's files, edited by `edit`. */
const sheet = (edit: (rows: string[][]) => string[][] = (r) => r) => toCsv(edit(wordsToRows(words)));
const col = (name: string) => WORD_COLUMNS.indexOf(name);
const newRow = (over: Record<string, string> = {}) => {
  const r: Record<string, string> = {
    slug: 'kawkab',
    ar: 'كَوْكَب',
    translit: 'kawkab',
    meaning_1: 'a star; a planet',
    topics: 'sky',
    added: '2026-10-03',
    example_1_ar: 'لمع كوكب في الأفق.',
    example_1_en: 'A star glittered on the horizon.',
    ...over,
  };
  return WORD_COLUMNS.map((c) => r[c] ?? '');
};

describe('CSV', () => {
  test('reads quotes, doubled quotes, commas and newlines inside cells, and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, ""y""","line 1\nline 2"\r\n')).toEqual([
      ['a', 'b'],
      ['x, "y"', 'line 1\nline 2'],
    ]);
  });
  test('round-trips', () => {
    const rows = [['a', 'b,c'], ['"q"', 'نَجْم']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('import', () => {
  test('the exported Sheet imports back to the same files, byte for byte', () => {
    const r = importSheet({ wordsCsv: sheet(), topicsCsv: toCsv(topicsToRows(topics)), ...current });
    expect(r.errors).toEqual([]);
    expect(r.changed).toBe(false);
    expect(formatWords(r.words)).toBe(formatWords(words));
    expect(r.topics).toEqual(topics);
  });

  test('a new row and an edited row show up in the summary', () => {
    const r = importSheet({
      wordsCsv: sheet((rows) => {
        rows[1][col('meaning_1')] = 'a large, perfect pearl';
        rows[1][col('status')] = 'reviewed';
        return [...rows, newRow()];
      }),
      ...current,
    });
    expect(r.errors).toEqual([]);
    expect(r.changed).toBe(true);
    expect(r.wordDiff.added.map((w) => w.slug)).toEqual(['kawkab']);
    expect(r.wordDiff.changed).toEqual([{ id: 'durrah', fields: ['meanings', 'status'] }]);
    expect(r.words.at(-1)).toEqual({
      slug: 'kawkab',
      ar: 'كَوْكَب',
      translit: 'kawkab',
      meanings: ['a star; a planet'],
      topics: ['sky'],
      added: '2026-10-03',
      examples: [{ ar: 'لمع كوكب في الأفق.', en: 'A star glittered on the horizon.' }],
    });
    expect(r.words[0].status).toBe('reviewed');
    const total = words.length + 1;
    const unreviewed = r.words.filter((w) => w.status !== 'reviewed').length;
    expect(r.summary).toContain(`1 new word, 1 changed word, 0 removed words. ${total} words in total.`);
    expect(r.summary).toContain('`kawkab`');
    expect(r.summary).toContain(`| **The whole sea** | **${total}** | **${unreviewed}** |`);
  });

  test('a new row without a date joins today', () => {
    const r = importSheet({ wordsCsv: sheet((rows) => [...rows, newRow({ added: '' })]), ...current });
    expect(r.errors).toEqual([]);
    expect(r.words.at(-1).added).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('invalid rows fail and are named', () => {
    const r = importSheet({
      wordsCsv: sheet((rows) => [
        ...rows,
        newRow({ ar: 'كوكب' }),
        newRow({ slug: 'kawkab-2', topics: 'planets' }),
        newRow({ slug: 'jabr', topics: 'borrowed' }),
        newRow({ slug: 'kawkab-3', status: 'done' }),
        newRow({ slug: 'durrah' }),
      ]),
      ...current,
    });
    expect(r.errors.join('\n')).toMatch(/kawkab\): ar \(the headword\) needs its diacritics/);
    expect(r.errors.join('\n')).toMatch(/unknown topic "planets"/);
    expect(r.errors.join('\n')).toMatch(/jabr\): words in "borrowed" need etymology.source/);
    expect(r.errors.join('\n')).toMatch(/kawkab-3\): status must be blank, draft or reviewed/);
    expect(r.errors.join('\n')).toMatch(/durrah\): duplicate slug/);
    expect(r.summary).toContain('Nothing was imported');
  });

  test('an image id that is not in the illustrations registry fails', () => {
    const r = importSheet({ wordsCsv: sheet((rows) => [...rows, newRow({ image: 'no-such-plate' })]), ...current, illustrations });
    expect(r.errors.join('\n')).toMatch(/no-such-plate/);
  });

  test('a missing column fails', () => {
    const r = importSheet({ wordsCsv: sheet((rows) => rows.map((x) => x.filter((_, i) => i !== col('translit')))), ...current });
    expect(r.errors).toEqual(['words tab: missing column "translit"']);
  });

  test('words missing from the Sheet are kept in place until removals are confirmed', () => {
    const wordsCsv = sheet((rows) => {
      rows[1][col('status')] = 'reviewed';
      return rows.filter((x) => x[0] !== 'ud' && x[0] !== 'shaykh');
    });
    const kept = importSheet({ wordsCsv, ...current });
    expect(kept.errors).toEqual([]);
    expect(kept.blockedRemovals).toBe(false);
    expect(kept.notInSheet.map((w) => w.slug)).toEqual(['ud', 'shaykh']);
    expect(kept.words.map((w) => w.slug)).toEqual(words.map((w) => w.slug));
    expect(kept.wordDiff.changed).toEqual([{ id: 'durrah', fields: ['status'] }]);
    expect(kept.summary).toContain('### In the repo, not in the Sheet yet (2, kept)');
    expect(kept.summary).toContain('0 removed words');
    const allowed = importSheet({ wordsCsv, ...current, allowRemovals: true });
    expect(allowed.words).toHaveLength(words.length - 2);
    expect(allowed.summary).toContain('### Removed');
  });

  test('topic removals are blocked until confirmed', () => {
    const spare = { ...topics[0], id: 'spare', order: 99 };
    const topicsCsv = toCsv(topicsToRows(topics));
    const blocked = importSheet({ wordsCsv: sheet(), topicsCsv, currentWords: words, currentTopics: [...topics, spare] });
    expect(blocked.errors).toEqual([]);
    expect(blocked.blockedRemovals).toBe(true);
    expect(blocked.summary).toContain('Removals were not confirmed');
  });

  test('a header row appended again is skipped', () => {
    const r = importSheet({ wordsCsv: sheet((rows) => [...rows, rows[0], newRow()]), ...current });
    expect(r.errors).toEqual([]);
    expect(r.wordDiff.added.map((w) => w.slug)).toEqual(['kawkab']);
  });

  test('fields the Sheet has no column for are kept', () => {
    const withAudio = words.map((w, i) => (i === 0 ? { ...w, audio: 'durrah.mp3' } : w));
    const r = importSheet({ wordsCsv: sheet(), currentWords: withAudio, currentTopics: topics });
    expect(r.words[0].audio).toBe('durrah.mp3');
    expect(r.changed).toBe(false);
  });
});
