export interface Example {
  /** Arabic sentence (diacritics optional). */
  ar: string;
  /** English translation. */
  en: string;
  /** Attribution for quotations or proverbs. */
  source?: string;
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
  /** Reserved for future pronunciation audio. */
  audio?: string;
  /** ISO date the word joined the dataset (2026-09-24 for the original set); drives Pearl of the Day cycles. */
  added: string;
  /** An illustration (decision 5): drawn faintly on the card and the share image. */
  image?: WordImage;
  /** Where the word comes from, or where it went. Required for words in the "borrowed" topic. */
  etymology?: Etymology;
  /** Native-speaker review state (docs/CONTENT.md). Absent means draft. */
  status?: 'draft' | 'reviewed';
}

export interface WordImage {
  /** A key on the image host (e.g. "illustrations/ward.webp") or a full https URL. */
  src: string;
  alt: string;
  /** Who made it, e.g. "After Pierre-Joseph Redouté, Les Roses (1817)". */
  credit: string;
  /** E.g. "Public domain" or "CC0". */
  license: string;
  sourceUrl?: string;
}

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
  /** Optional cover image key or URL (topic pages, OG image). */
  cover?: string;
}

export type SwipeDir = 'known' | 'learning';
