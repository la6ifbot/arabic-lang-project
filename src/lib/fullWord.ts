import { useEffect, useState } from 'react';
import type { Word, WordCore } from '../types';

type Details = typeof import('./wordDetails');
let details: Details | null = null;
let loading: Promise<Details> | null = null;

/** Loads the word details chunk once (the screen-reader mirror's first render starts it). A failed load is retried. */
export function loadWordDetails(): Promise<Details> {
  loading ??= import('./wordDetails').then(
    (m) => (details = m),
    (e: unknown) => {
      loading = null;
      throw e;
    },
  );
  return loading;
}

/** The whole entry once the details have loaded; until then the core, so examples show a moment later. */
export function useFullWord(word: WordCore): WordCore & Partial<Word> {
  const [, setLoaded] = useState(details !== null);
  useEffect(() => {
    if (!details) loadWordDetails().then(() => setLoaded(true), () => {});
  }, []);
  return details?.fullWord(word.slug) ?? word;
}
