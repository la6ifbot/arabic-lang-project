// The heavy half of the word data: examples, etymologies, roots and syllable overrides. Import ONLY from
// lazy chunks (scene, share, anatomy) or through loadWordDetails() (./fullWord): it carries every word's
// details, which are kept out of the first-paint bundle.
import details from '../data/words.json?details';
import type { Word } from '../types';
import { WORD_BY_SLUG } from './words';

const FULL: ReadonlyMap<string, Word> = new Map([...WORD_BY_SLUG].map(([slug, core]) => [slug, { ...core, ...details[slug] } as Word]));

/** The whole entry for a slug, or undefined for an unknown one. */
export const fullWord = (slug: string): Word | undefined => FULL.get(slug);
