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
  tags?: string[];
  /** Reserved for future pronunciation audio. */
  audio?: string;
  /** ISO date the word joined the dataset (words added after launch); drives Pearl of the Day cycles. */
  added?: string;
}

export type SwipeDir = 'known' | 'learning';
