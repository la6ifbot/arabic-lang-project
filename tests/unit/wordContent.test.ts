// Content checks that keep holding as the word list grows (Phase 0.7, section I). The validator itself
// runs on every word in topics.test.ts.
import { describe, expect, test } from 'vitest';
import words from '../../src/data/words.json';
import firstCycle from './fixtures/pearl-first-cycle.json';
import { addDays, pearlForDate } from '../../shared/pearlOfTheDay';
import { normalizeArabic, searchWords, WORDS as CORE } from '../../src/lib/words';
import type { Word } from '../../src/types';

const WORDS = words as Word[];

/** Groups of words whose keys collide (only groups of two or more). */
function collisions(key: (w: Word) => string): string[][] {
  const by = new Map<string, string[]>();
  for (const w of WORDS) by.set(key(w), [...(by.get(key(w)) ?? []), w.slug]);
  return [...by.values()].filter((g) => g.length > 1).map((g) => g.sort());
}

/** Different words spelled with the same letters, told apart by their vowels. */
const HOMOGRAPHS = [
  ['hilm', 'hulm'], // forbearance, dream
  ['zahrah', 'zuharah'], // flower, Venus
  ['araq', 'irq'], // sweat, a sea of dunes
];

describe('no duplicate or near-duplicate words', () => {
  test('headwords are unique, voweled or not (al- and hamza seats aside), except known homographs', () => {
    expect(collisions((w) => w.ar.normalize('NFC').trim())).toEqual([]);
    const letters = (w: Word) => normalizeArabic(w.ar).split(/\s+/).map((t) => t.replace(/^ال/, '')).join(' ');
    const known = new Set(HOMOGRAPHS.map((g) => g.join(' ')));
    expect(collisions(letters).filter((g) => !known.has(g.join(' ')))).toEqual([]);
  });

  test('slugs and transliterations are unique, also ignoring hyphens and doubled letters in slugs', () => {
    expect(collisions((w) => w.slug.replace(/-/g, '').replace(/(.)\1+/g, '$1'))).toEqual([]);
    expect(collisions((w) => w.translit.normalize('NFC'))).toEqual([]);
  });
});

describe('Pearl of the Day', () => {
  test(`past and announced days (the first cycle, ${firstCycle.from} to ${firstCycle.to}) never change`, () => {
    expect(firstCycle.slugs).toHaveLength(140);
    expect(addDays(firstCycle.from, firstCycle.slugs.length - 1)).toBe(firstCycle.to);
    expect(firstCycle.slugs.map((_, i) => pearlForDate(addDays(firstCycle.from, i), WORDS))).toEqual(firstCycle.slugs);
  });
});

describe('the site’s copy of the data', () => {
  test('first paint gets every word without its details', () => {
    expect(CORE.map((w) => w.slug)).toEqual(WORDS.map((w) => w.slug));
    for (const w of CORE) expect(Object.keys(w).filter((k) => ['examples', 'etymology', 'root', 'syllables'].includes(k))).toEqual([]);
  });

  test('the details come back whole', async () => {
    const { fullWord } = await import('../../src/lib/wordDetails');
    for (const w of WORDS) expect(fullWord(w.slug)).toEqual(w);
  });

  test('search stays instant: 500 queries over every word take well under a frame each', () => {
    const queries = WORDS.flatMap((w) => [w.ar, w.translit, w.meanings[0]]).slice(0, 500);
    const t = performance.now();
    for (const q of queries) searchWords(q);
    expect((performance.now() - t) / queries.length).toBeLessThan(4);
  });
});
