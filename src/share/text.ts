import type { Word } from '../types';

declare const __SITE_ORIGIN__: string | undefined;

/** Canonical origin baked in at build time (see shared/site.ts); durar.space by default. */
export const SITE_ORIGIN: string = typeof __SITE_ORIGIN__ === 'string' ? __SITE_ORIGIN__ : 'https://durar.space';

/** The canonical word page. Never carries query parameters (no tracking). */
export function wordUrl(slug: string, origin = SITE_ORIGIN): string {
  return `${origin}/word/${encodeURIComponent(slug)}`;
}

// Bidi controls keep mixed Arabic/English text in order in any app: LRM makes the line
// left-to-right even though it may start with Arabic, and FSI…PDI isolates each Arabic run.
const LRM = '‎';
const ar = (s: string) => `⁨${s}⁩`;

/** One line describing the word, e.g. “سَرَاب (sarāb) — mirage · a pearl from Durar”. */
export function shareText(word: Pick<Word, 'ar' | 'translit' | 'meanings'>, opts: { today?: boolean } = {}): string {
  const core = `${ar(word.ar)} (${word.translit}) — ${word.meanings[0]}`;
  return opts.today ? `${LRM}${ar('دُرَّةُ اليَوْم')} · Today’s pearl: ${core}` : `${LRM}${core} · a pearl from Durar`;
}

/** Text + link as a single message (WhatsApp, clipboard fallbacks). */
export function shareMessage(word: Pick<Word, 'slug' | 'ar' | 'translit' | 'meanings'>, opts: { today?: boolean } = {}): string {
  return `${shareText(word, opts)}\n${wordUrl(word.slug)}`;
}

export function whatsappUrl(word: Pick<Word, 'slug' | 'ar' | 'translit' | 'meanings'>, opts: { today?: boolean } = {}): string {
  return `https://wa.me/?text=${encodeURIComponent(shareMessage(word, opts))}`;
}

/** Alt text / description for the story image. */
export const imageDescription = (word: Pick<Word, 'ar' | 'translit' | 'meanings'>) => `${word.ar} (${word.translit}): ${word.meanings[0]}`;

export const imageFileName = (slug: string) => `durar-${slug}.png`;
