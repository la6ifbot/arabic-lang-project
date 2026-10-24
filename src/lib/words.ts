// The core of every word (vite.config.ts, splitWords). Examples, etymologies, roots and syllables
// load on demand from ./wordDetails, so the first-paint bundle doesn't grow with the word count.
import raw from '../data/words.json?core';
import { pearlOfTheDay } from '../../shared/pearlOfTheDay';
import type { WordCore } from '../types';

export const WORDS: WordCore[] = raw;
export const WORD_BY_SLUG: ReadonlyMap<string, WordCore> = new Map(WORDS.map((w) => [w.slug, w]));

/** Today's Pearl of the Day (Amsterdam calendar day), fixed for this visit. */
export const TODAY = pearlOfTheDay(WORDS);

const AR_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const ARABIC = /[؀-ۿ]/;

/** Strips diacritics/tatweel and folds letter variants so “أمل”, “امل” and “أَمَل” match. */
export function normalizeArabic(s: string): string {
  return s
    .replace(AR_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim();
}

export function normalizeLatin(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[ʿʾ'’`-]/g, '')
    .toLowerCase()
    .trim();
}

interface Indexed {
  word: WordCore;
  ar: string;
  translit: string;
  meaningWords: string[];
  meanings: string;
}

const INDEX: Indexed[] = WORDS.map((word) => {
  const meanings = normalizeLatin(word.meanings.join(' '));
  return {
    word,
    ar: normalizeArabic(word.ar),
    translit: normalizeLatin(word.translit).replace(/\s+/g, ''),
    meanings,
    meaningWords: meanings.split(/[^a-z]+/).filter(Boolean),
  };
});

/** Ranked, typo-tolerant-enough search across Arabic, transliteration and English meanings. */
export function searchWords(query: string, limit = 7): WordCore[] {
  const q = query.trim();
  if (!q) return [];
  const scored: { word: WordCore; score: number }[] = [];

  if (ARABIC.test(q)) {
    const nq = normalizeArabic(q).replace(/^ال/, '');
    if (!nq) return [];
    for (const it of INDEX) {
      let score = 0;
      if (it.ar === nq) score = 100;
      else if (it.ar.startsWith(nq)) score = 70;
      else if (it.ar.includes(nq)) score = 40;
      if (score) scored.push({ word: it.word, score });
    }
  } else {
    const nq = normalizeLatin(q);
    const compact = nq.replace(/\s+/g, '');
    if (!nq) return [];
    for (const it of INDEX) {
      let score = 0;
      if (it.translit === compact) score = 100;
      else if (it.translit.startsWith(compact)) score = 75;
      if (it.meaningWords.includes(nq)) score = Math.max(score, 90);
      else if (it.meaningWords.some((m) => m.startsWith(nq))) score = Math.max(score, 60);
      else if (nq.length > 2 && it.meanings.includes(nq)) score = Math.max(score, 35);
      if (score) scored.push({ word: it.word, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.word.translit.length - b.word.translit.length)
    .slice(0, limit)
    .map((s) => s.word);
}
