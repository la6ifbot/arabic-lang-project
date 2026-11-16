import { describe, expect, it } from 'vitest';
import glosses from '../../src/data/glosses.json';
import words from '../../src/data/words.json';

type Gloss = { ex: number; w: string; ar: string; en: string; src: string };
const plain = (s: string) => s.replace(/[ً-ْٰـ]/g, '').replace(/[أإآ]/g, 'ا');
const BY_SLUG = new Map(words.map((w) => [w.slug, w]));

describe('hard words (src/data/glosses.json)', () => {
  const entries = Object.entries(glosses as Record<string, Gloss[]>);

  it('every entry belongs to a real word and one of its example sentences', () => {
    for (const [slug, list] of entries) {
      const word = BY_SLUG.get(slug);
      expect(word, slug).toBeDefined();
      for (const g of list) {
        const ex = word!.examples[g.ex];
        expect(ex, `${slug} #${g.ex}`).toBeDefined();
        expect(plain(ex.ar), `${slug}: ${g.w}`).toContain(plain(g.w));
      }
    }
  });

  it('names its dictionary, has a meaning, never repeats the card’s own word', () => {
    for (const [slug, list] of entries) {
      for (const g of list) {
        expect(['Hans Wehr', 'Lane']).toContain(g.src);
        expect(g.en.trim().length, `${slug}: ${g.w}`).toBeGreaterThan(2);
        expect(plain(g.ar)).not.toBe(plain(BY_SLUG.get(slug)!.ar));
      }
      expect(new Set(list.map((g) => `${g.ex}:${g.w}`)).size, slug).toBe(list.length);
    }
  });
});
