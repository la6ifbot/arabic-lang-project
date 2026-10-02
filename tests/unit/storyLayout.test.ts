import { describe, expect, test } from 'vitest';
import words from '../../src/data/words.json';
import { CARD, CONTENT, SAFE, SIGNATURE_BOX, STORY } from '../../src/share/geometry';
import { layoutStory, type Measure } from '../../src/share/layout';
import type { Word } from '../../src/types';

/**
 * A stand-in for canvas text measurement, deliberately on the wide side of the real fonts: every
 * character is 0.55 em (Arabic 0.5 em), plus letter spacing.
 */
const measure: Measure = (text, font, rtl, spacing) => {
  const size = Number(/(\d+)px/.exec(font)![1]);
  return [...text].length * size * (rtl ? 0.5 : 0.55) + spacing * text.length;
};

const long = (n: number, s: string) => Array.from({ length: n }, () => s).join(' ');

const extremes: Word[] = ([
  { slug: 'short', ar: 'نُور', translit: 'nūr', meanings: ['light'], examples: [] },
  {
    slug: 'long-head',
    ar: 'مُسْتَشْفَيَاتُهُمْ الكَبِيرَةُ الجَمِيلَةُ',
    translit: 'mustashfayātuhum al-kabīrah al-jamīlah',
    meanings: ['their big beautiful hospitals'],
    examples: [{ ar: 'كَلِمَة', en: 'a word' }],
  },
  {
    slug: 'many-meanings',
    ar: 'عَيْن',
    translit: 'ʿayn',
    meanings: ['eye', 'spring of water', 'the essence of a thing', 'a spy', 'a notable person', 'the letter ʿayn', 'gold coin'],
    examples: [{ ar: 'رَأَيْتُهُ بِعَيْنِي', en: 'I saw it with my own eyes.' }],
  },
  {
    slug: 'long-example',
    ar: 'أَزَل',
    translit: 'azal',
    meanings: ['eternity without beginning'],
    examples: [
      {
        ar: long(14, 'تتحدث الأساطير عن نور وُجد منذ الأزل'),
        en: long(12, 'The legends tell of a light that has existed since before time began.'),
        source: 'A very long attribution that goes on and on for a while',
      },
    ],
  },
] as Omit<Word, 'topics' | 'added'>[]).map((w) => ({ ...w, topics: [], added: '2026-09-24' }));

function expectInside(word: Word) {
  const layout = layoutStory(word, measure);
  expect(layout.fits, word.slug).toBe(true);
  for (const l of layout.lines) {
    // Inside the card's text area: above the signature, within the card's width.
    expect(l.top).toBeGreaterThanOrEqual(CONTENT.top);
    expect(l.bottom).toBeLessThanOrEqual(CONTENT.bottom + 0.5);
    expect(l.width).toBeLessThanOrEqual(CONTENT.headWidth + 0.5);
    expect(l.x - l.width / 2).toBeGreaterThanOrEqual(CARD.x);
    expect(l.x + l.width / 2).toBeLessThanOrEqual(CARD.x + CARD.w);
  }
  return layout;
}

describe('story image geometry', () => {
  test('9:16, and the card and signature sit inside Instagram’s safe area', () => {
    expect(STORY.width / STORY.height).toBeCloseTo(9 / 16);
    expect(SAFE.top).toBeGreaterThanOrEqual(STORY.height * 0.14 - 1);
    expect(SAFE.bottom).toBeLessThanOrEqual(STORY.height * 0.8 + 1);
    expect(CARD.y).toBeGreaterThanOrEqual(SAFE.top);
    expect(CARD.y + CARD.h).toBeLessThanOrEqual(SAFE.bottom);
    expect(SIGNATURE_BOX.y).toBeGreaterThanOrEqual(SAFE.top);
    expect(SIGNATURE_BOX.y + SIGNATURE_BOX.h).toBeLessThanOrEqual(SAFE.bottom);
    expect(SIGNATURE_BOX.x + SIGNATURE_BOX.w).toBeLessThanOrEqual(CARD.x + CARD.w);
    expect(CONTENT.bottom).toBeLessThan(SIGNATURE_BOX.y);
  });
});

describe('story layout auto-fit', () => {
  test.each(extremes.map((w) => [w.slug, w] as const))('%s: nothing clips or overflows', (_, w) => {
    expectInside(w);
  });

  test('every word in the dataset fits', () => {
    for (const w of words as Word[]) expectInside(w);
  });

  test('short words stay large; long ones shrink', () => {
    const short = expectInside(extremes[0]);
    const longest = expectInside(extremes[3]);
    expect(short.scale).toBe(1);
    expect(longest.scale).toBeLessThan(0.8);
  });

  test('all meanings and one example are on the card, Arabic set right-to-left', () => {
    const layout = expectInside(extremes[2]);
    const text = layout.lines.map((l) => l.text).join(' ');
    expect(layout.lines.map((l) => l.text)).toContain('eye');
    expect(text).toContain('spring of water; the essence');
    expect(text).toContain('gold coin');
    const arabic = layout.lines.filter((l) => l.rtl).map((l) => l.text);
    expect(arabic).toEqual(['عَيْن', 'رَأَيْتُهُ بِعَيْنِي']);
  });
});
