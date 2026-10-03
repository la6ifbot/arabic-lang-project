import { describe, expect, test } from 'vitest';
import words from '../../src/data/words.json';
import topics from '../../src/data/topics.json';
import { addDays, PEARL_EPOCH, pearlForDate, type ScheduledWord } from '../../shared/pearlOfTheDay';
import { validateTopics, validateWords } from '../../scripts/lib/word-schema.mjs';
import { formatWords, migrateWord, ORIGINAL_ADDED, TAG_TO_TOPICS, topicsFor } from '../../scripts/migrate-tags-to-topics.mjs';
import type { Word } from '../../src/types';

const WORDS = words as Word[];
const word = (over: Record<string, unknown> = {}) => ({
  slug: 'test-star',
  ar: 'نَجْم',
  translit: 'najm',
  meanings: ['star'],
  topics: ['sky'],
  added: '2026-10-02',
  examples: [{ ar: 'نجم بعيد.', en: 'A distant star.' }],
  ...over,
});
/** The real data plus one test word, so the 100-word minimum holds. */
const check = (w: Record<string, unknown>) => validateWords([...WORDS.slice(1), w], topics).errors;

describe('the data in the repo', () => {
  test('words and topics pass the validator', () => {
    expect(validateTopics(topics).errors).toEqual([]);
    expect(validateWords(WORDS, topics).errors).toEqual([]);
  });

  test('every word keeps its slug (no /word/<slug> URL changes) and has topics and added', () => {
    expect(WORDS).toHaveLength(140);
    for (const w of WORDS) {
      expect(Array.isArray(w.topics)).toBe(true);
      expect(w.added).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(w).not.toHaveProperty('tags');
    }
  });
});

describe('validator', () => {
  test('a well-formed word passes', () => expect(check(word())).toEqual([]));

  test('the headword needs diacritics', () => expect(check(word({ ar: 'نجم' }))).toEqual([expect.stringMatching(/diacritics/)]));

  test.each([['Najm'], ["sa'adah"], ['saʿadah '], ['qaws  quzaḥ'], ['sa’adah'], ['māʾ']])('rejects transliteration %j', (translit) =>
    expect(check(word({ translit }))).toEqual([expect.stringMatching(/translit/)]),
  );

  test('accepts ʿayn, hamza, macrons, dots below and spaces', () =>
    expect(check(word({ translit: 'qaws quzaḥ ʿāʾ' }))).toEqual([]));

  test('1–3 examples', () => {
    const ex = { ar: 'نجم.', en: 'Star.' };
    expect(check(word({ examples: [] }))).toEqual([expect.stringMatching(/1–3 examples/)]);
    expect(check(word({ examples: [ex, ex, ex, ex] }))).toEqual([expect.stringMatching(/1–3 examples/)]);
    expect(check(word({ examples: [ex, ex, ex] }))).toEqual([]);
  });

  test('topic ids must exist; an empty list is the whole sea', () => {
    expect(check(word({ topics: ['stars'] }))).toEqual([expect.stringMatching(/unknown topic "stars"/)]);
    expect(check(word({ topics: [] }))).toEqual([]);
    expect(check(word({ topics: undefined }))).toEqual([expect.stringMatching(/topics must be an array/)]);
  });

  test('old tags are rejected', () => expect(check(word({ tags: ['sky'] }))).toEqual([expect.stringMatching(/tags were replaced/)]));

  test('added is required and not before Pearl of the Day began', () => {
    expect(check(word({ added: undefined }))).toEqual([expect.stringMatching(/missing added/)]);
    expect(check(word({ added: '2026-09-01' }))).toEqual([expect.stringMatching(/on or after/)]);
    expect(check(word({ added: '2026-13-45' }))).toEqual([expect.stringMatching(/on or after/)]);
  });

  test('borrowed words need etymology.source', () => {
    expect(check(word({ topics: ['borrowed'] }))).toEqual([expect.stringMatching(/etymology\.source/)]);
    expect(check(word({ topics: ['borrowed'], etymology: { text: 'Via Spanish.', source: '' } }))).not.toEqual([]);
    expect(check(word({ topics: ['borrowed'], etymology: { text: 'Via Spanish.', source: 'OED, s.v. “zenith”' } }))).toEqual([]);
  });

  test('an image is an illustration id (its credit lives in src/data/illustrations.json)', () => {
    expect(check(word({ image: 'rose-centifolia' }))).toEqual([]);
    expect(check(word({ image: 'illustrations/najm.webp' }))).toEqual([expect.stringMatching(/illustration id/)]);
    expect(check(word({ image: { src: 'x.webp' } }))).toEqual([expect.stringMatching(/illustration id/)]);
  });

  test('slugs are unique', () =>
    expect(check(word({ slug: WORDS[1].slug }))).toEqual([expect.stringMatching(/duplicate slug/)]));

  test('topics short of 20 words are warnings, not errors', () => {
    const { errors, warnings } = validateWords(WORDS, topics);
    expect(errors).toEqual([]);
    expect(warnings).toContain('topic "borrowed" has 0 words (target 20)');
  });

  test('the registry needs bilingual names and descriptions, unique ids and orders', () => {
    const t = topics[0];
    expect(validateTopics([t, { ...t }]).errors).toEqual(expect.arrayContaining([expect.stringMatching(/duplicate id/), expect.stringMatching(/duplicate order/)]));
    expect(validateTopics([{ ...t, name: { en: 'Sea' } }]).errors).toEqual([expect.stringMatching(/name needs en and ar/)]);
    expect(validateTopics([{ ...t, description: { en: 'x', ar: 'sea' } }]).errors).toEqual([expect.stringMatching(/description/)]);
  });
});

describe('tags → topics migration', () => {
  test('every old tag has a mapping, and mappings only name registry topics', () => {
    const ids = new Set(topics.map((t) => t.id));
    for (const list of Object.values(TAG_TO_TOPICS)) for (const t of list) expect(ids.has(t)).toBe(true);
  });

  test('tags become topics in place, in registry order, with the original added date', () => {
    const old = { slug: 'matar', ar: 'مَطَر', translit: 'maṭar', meanings: ['rain'], root: 'م ط ر', tags: ['weather'], examples: [] };
    const m = migrateWord(old);
    expect(Object.keys(m)).toEqual(['slug', 'ar', 'translit', 'meanings', 'root', 'topics', 'added', 'examples']);
    expect(m.topics).toEqual(['water', 'sky']);
    expect(m.added).toBe(ORIGINAL_ADDED);
  });

  test('overrides add and remove', () => {
    expect(topicsFor({ slug: 'sarab', tags: ['desert', 'mind'] })).toEqual(['desert']);
    expect(topicsFor({ slug: 'yaqut', tags: ['gem'] })).toEqual([]);
  });

  test('unknown tags fail loudly', () => expect(() => topicsFor({ slug: 'x', tags: ['mystery'] })).toThrow(/no mapping/));

  test('running it again changes nothing', () => {
    expect(WORDS.map((w) => migrateWord(w as never))).toEqual(WORDS);
  });

  test('keeps one word per line', () => {
    const out = formatWords(WORDS);
    expect(out.split('\n')).toHaveLength(WORDS.length + 3);
    expect(JSON.parse(out)).toEqual(WORDS);
  });
});

describe('Pearl of the Day is unchanged by the explicit added date', () => {
  test('the next four years match the schedule computed without it', () => {
    const before: ScheduledWord[] = WORDS.map(({ slug, added }) => (added === PEARL_EPOCH ? { slug } : { slug, added }));
    expect(ORIGINAL_ADDED).toBe(PEARL_EPOCH);
    for (let i = 0; i < 1500; i++) {
      const d = addDays(PEARL_EPOCH, i);
      expect(pearlForDate(d, WORDS)).toBe(pearlForDate(d, before));
    }
  });
});
