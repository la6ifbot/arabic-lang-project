import { ANATOMY_TEACH_KEY } from '../account/storageKeys';

/**
 * The letters' teaching animation (Phase 0.8, decision 9): a peek at the first letter and a glint
 * across the row show that the letters can be tapped. It plays the first 3 times Letters opens on
 * this device, and never again once a letter has been tapped.
 */
export const TEACH_TIMES = 3;

export type TeachState = { shown: number; tapped: boolean };

const fresh = (): TeachState => ({ shown: 0, tapped: false });

/** Whether to play it: not after a letter tap, not past 3 showings, and never with reduced motion. */
export function shouldTeach(s: TeachState, reducedMotion: boolean): boolean {
  return !reducedMotion && !s.tapped && s.shown < TEACH_TIMES;
}

/** Reads what this device remembers; anything unreadable counts as a first visit. */
export function parseTeach(raw: string | null): TeachState {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<TeachState> | null;
    if (!v || typeof v !== 'object') return fresh();
    const shown = Number.isFinite(v.shown) ? Math.max(0, Math.floor(v.shown as number)) : 0;
    return { shown, tapped: v.tapped === true };
  } catch {
    return fresh();
  }
}

function read(): TeachState {
  try {
    return parseTeach(localStorage.getItem(ANATOMY_TEACH_KEY));
  } catch {
    return fresh();
  }
}

function write(s: TeachState) {
  try {
    localStorage.setItem(ANATOMY_TEACH_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: it simply plays again next time.
  }
}

/** Called once as Letters opens: whether to play it now (and counts the showing if so). */
export function takeTeach(reducedMotion: boolean): boolean {
  const s = read();
  if (!shouldTeach(s, reducedMotion)) return false;
  write({ ...s, shown: s.shown + 1 });
  return true;
}

/** A letter was tapped: the lesson is learnt, so it never plays again. */
export function noteLetterTap() {
  const s = read();
  if (!s.tapped) write({ ...s, tapped: true });
}

/** The hint under the letters, in the words of the pointer in use: a finger taps, a mouse clicks. */
export function letterHint(coarsePointer: boolean): string {
  return `${coarsePointer ? 'Tap' : 'Click'} a letter to see its four shapes.`;
}

/** Whether the main pointer is a finger (feature detection, not device sniffing). */
export function hasCoarsePointer(): boolean {
  try {
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    return false;
  }
}
