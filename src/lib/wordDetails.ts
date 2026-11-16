// The heavy half of the word data: examples, etymologies, roots and syllable overrides. Import ONLY from
// lazy chunks (scene, share, anatomy) or through loadWordDetails() (./fullWord): it carries every word's
// details, which are kept out of the first-paint bundle.
import details from '../data/words.json?details';
import glosses from '../data/glosses.json';
import type { Word } from '../types';
import { WORD_BY_SLUG } from './words';

const FULL: ReadonlyMap<string, Word> = new Map([...WORD_BY_SLUG].map(([slug, core]) => [slug, { ...core, ...details[slug] } as Word]));

/** The whole entry for a slug, or undefined for an unknown one. */
export const fullWord = (slug: string): Word | undefined => FULL.get(slug);

/**
 * A harder word in one of a card's example sentences, with a short meaning: `ex` is the example's
 * index, `w` the word as the sentence writes it (no vowel marks), `ar` its dictionary form, `src`
 * the dictionary the meaning follows (src/data/glosses.json, docs/CONTENT.md).
 */
export interface Gloss {
  ex: number;
  w: string;
  ar: string;
  en: string;
  src: string;
}
const GLOSSES = glosses as Record<string, Gloss[]>;

/** The harder words of a word's example sentences (empty when none need it). */
export const glossesOf = (slug: string): Gloss[] => GLOSSES[slug] ?? [];
