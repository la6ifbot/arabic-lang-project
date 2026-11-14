import { WORD_TAP_KEY } from '../account/storageKeys';

/**
 * Showing that the Arabic word on the card can be tapped (it unthreads into its letters): a gentle
 * glow breathes on the word now and then, and on the first visit a short hint says so. Both stop for
 * good on this device once the word has been tapped; the hint itself shows only once.
 */
export type WordTapState = { tapped: boolean; hinted: boolean };

/** Reads what this device remembers; anything unreadable counts as a first visit. */
export function parseWordTap(raw: string | null): WordTapState {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<WordTapState> | null;
    return { tapped: v?.tapped === true, hinted: v?.hinted === true };
  } catch {
    return { tapped: false, hinted: false };
  }
}

export function readWordTap(): WordTapState {
  try {
    return parseWordTap(localStorage.getItem(WORD_TAP_KEY));
  } catch {
    // Storage blocked: count it as learnt, so it doesn't glow on every visit forever.
    return { tapped: true, hinted: true };
  }
}

function write(s: WordTapState) {
  try {
    localStorage.setItem(WORD_TAP_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();
export const onWordTap = (fn: Listener) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** The word itself was tapped (or clicked): the lesson is learnt, so neither shows again. */
export function noteWordTap() {
  const s = readWordTap();
  if (!s.tapped) write({ ...s, tapped: true });
  listeners.forEach((fn) => fn());
}

/** The hint has been shown: it never shows by itself again (the glow carries on until a tap). */
export function noteWordHinted() {
  const s = readWordTap();
  if (!s.hinted) write({ ...s, hinted: true });
}

/** The hint, in the words of the pointer in use: a finger taps, a mouse clicks. */
export function wordHint(coarsePointer: boolean): string {
  return `${coarsePointer ? 'Tap' : 'Click'} the word to see its letters`;
}
