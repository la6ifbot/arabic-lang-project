export interface Example {
  /** Arabic sentence (diacritics optional). */
  ar: string;
  /** English translation. */
  en: string;
  /** Attribution for quotations or proverbs. */
  source?: string;
  /** A pronunciation fix for this sentence's audio (shared/audio.ts). Build-time only. */
  say?: Say;
}

export interface Word {
  /** Stable, URL-safe id used for routes: /word/<slug>. */
  slug: string;
  /** Headword with full diacritics. */
  ar: string;
  translit: string;
  meanings: string[];
  examples: Example[];
  /** Space-separated root letters, reserved for the future root-family feature. */
  root?: string;
  /** Topic ids from src/data/topics.json. Empty: the word is only in the whole sea. */
  topics: string[];
  /** A pronunciation fix for the headword's audio (shared/audio.ts). Build-time only. */
  say?: Say;
  /** ISO date the word joined the dataset (2026-09-24 for the original set); drives Pearl of the Day cycles. */
  added: string;
  /**
   * An illustration (decision 5): the id of an entry in src/data/illustrations.json, which holds the
   * picture's source, credit, licence and alt text. Meant to be drawn faintly behind the card's text.
   */
  image?: string;
  /** Where the word comes from, or where it went. Required for words in the "borrowed" topic. */
  etymology?: Etymology;
  /** Native-speaker review state (docs/CONTENT.md). Absent means draft. */
  status?: 'draft' | 'reviewed';
  /**
   * Overrides the automatic syllables of the anatomy view (shared/anatomy.ts) where they're wrong:
   * beads in reading order, each with its letters as written and its sound, e.g. دُرْ dur, رَة rah.
   */
  syllables?: { ar: string; tr: string }[];
}

/** The heavy fields of a word, kept out of the first-paint bundle (src/lib/wordDetails.ts). */
export type WordDetailKey = 'examples' | 'etymology' | 'root' | 'syllables';

/** What first paint needs (lists, search, the schedule, topics); WORDS and WORD_BY_SLUG hold these. */
export type WordCore = Omit<Word, WordDetailKey>;

export interface Etymology {
  /** Original writing for Durar (decision 8), never copied from a dictionary. */
  text: string;
  /** The reference the claim rests on. */
  source: string;
}

export interface Topic {
  /** URL-safe id: /sea/<id>. */
  id: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  /** Position in the topic picker; "The whole sea" always comes first. */
  order: number;
  /** Optional cover: an illustration id from src/data/illustrations.json (topic pages, OG image). */
  cover?: string;
}

export type SwipeDir = 'known' | 'learning';

/**
 * A pronunciation fix for one headword or sentence's audio (shared/audio.ts, docs/CONTENT.md). At
 * most one of `ar` (a different spelling for the voice only, e.g. extra vowel marks) and `ipa` (the
 * exact sounds). `take` remakes the audio without changing the text: bump it when a file came out badly.
 */
export interface Say {
  ar?: string;
  ipa?: string;
  take?: number;
}

/** A word's audio on img.durar.space: the headword's key, then one per example, in order. */
export interface WordAudio {
  word: string;
  examples: string[];
}

/** words.json?audio (shared/audio.ts, audioLookup): the voice's folder and each word's hashes, space-separated. */
export interface AudioLookup {
  dir: string;
  words: Record<string, string>;
}
