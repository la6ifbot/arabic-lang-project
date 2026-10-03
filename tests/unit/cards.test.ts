import { describe, expect, test } from 'vitest';
import words from '../../src/data/words.json';
import { HOME_CARD, IMAGE_ORIGIN, cardHash, cardKey, cardStableKey, cardUrl, type CardWord } from '../../shared/cards';

const WORDS = words as CardWord[];
const bahr = WORDS.find((w) => w.slug === 'bahr')!;

describe('card image URLs', () => {
  test('are worked out from the word: content-hashed on img.durar.space', () => {
    // Same hashes as the PNGs that used to be committed under public/cards (manifest template 5).
    expect(cardUrl('og', bahr)).toBe(`${IMAGE_ORIGIN}/cards/og/bahr-a60d7be54c8c7b0e.png`);
    expect(cardUrl('email', bahr)).toBe('https://img.durar.space/cards/email/bahr-a60d7be54c8c7b0e.png');
    expect(cardUrl('og', HOME_CARD)).toBe(`${IMAGE_ORIGIN}/cards/og/durar-e14b646e3022f44f.png`);
  });

  test('change when anything drawn on the card changes, and only then', () => {
    const h = cardHash(bahr);
    expect(cardHash({ ...bahr, meanings: ['ocean', ...bahr.meanings.slice(1)] })).not.toBe(h);
    expect(cardHash({ ...bahr, ar: 'بَحْرٌ' })).not.toBe(h);
    expect(cardHash({ ...bahr, translit: 'bahr' })).not.toBe(h);
    expect(cardHash({ ...bahr, meanings: [bahr.meanings[0], 'something else'] })).toBe(h);
    expect(cardHash({ ...bahr, examples: [] } as CardWord)).toBe(h);
  });

  test('every word has its own file name', () => {
    const keys = new Set(WORDS.map((w) => cardKey('og', w)));
    expect(keys.size).toBe(WORDS.length);
    expect(keys.has(cardKey('og', HOME_CARD))).toBe(false);
  });

  test('the stable key (for links made before the move) has no hash', () => {
    expect(cardStableKey('email', bahr)).toBe('cards/email/bahr.png');
    expect(cardStableKey('og', HOME_CARD)).toBe('cards/og/durar.png');
  });
});
