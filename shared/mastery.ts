/**
 * Mastery: the five-box schedule. One module for the rules, shared by the site, the email sender
 * and the tests, so they can never disagree.
 *
 * - A word's first swipe puts it in box 2 (right, “I know this”) or box 1 (left, “still learning”).
 * - After that, right moves it up one box (box 5 is the ceiling) and left sends it back to box 1,
 *   counting a lapse.
 * - Each box sets when the word comes back. `due_at` is recalculated on every counted swipe, and a
 *   word is due when `due_at <= now` (a timestamp, no calendar-day logic).
 */

export type Box = 1 | 2 | 3 | 4 | 5;
export type Direction = 'known' | 'learning';

export const MAX_BOX: Box = 5;
/** Days until a word in box N comes back: box 1 → 1 day … box 5 → 35 days. */
export const BOX_DAYS: Readonly<Record<Box, number>> = { 1: 1, 2: 3, 3: 7, 4: 16, 5: 35 };

export const DAY_MS = 86_400_000;

export interface Progress {
  slug: string;
  box: Box;
  /** ISO timestamps. */
  dueAt: string;
  lastReviewedAt: string;
  timesSeen: number;
  lapses: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** The next state of a word after a counted swipe. `prev` is undefined the first time. */
export function review(slug: string, prev: Progress | undefined, dir: Direction, now: number): Progress {
  let box: Box;
  let lapses = prev?.lapses ?? 0;
  if (!prev) box = dir === 'known' ? 2 : 1;
  else if (dir === 'known') box = Math.min(prev.box + 1, MAX_BOX) as Box;
  else {
    box = 1;
    lapses += 1;
  }
  return {
    slug,
    box,
    dueAt: iso(now + BOX_DAYS[box] * DAY_MS),
    lastReviewedAt: iso(now),
    timesSeen: (prev?.timesSeen ?? 0) + 1,
    lapses,
  };
}

export function isDue(p: Pick<Progress, 'dueAt'>, now: number): boolean {
  return Date.parse(p.dueAt) <= now;
}

/**
 * Order for due words, shared by the sea's queue and the email's revisit line: the most overdue
 * first (in whole days), then the lowest box, then the earliest due time.
 */
export function compareDue(a: Pick<Progress, 'box' | 'dueAt'>, b: Pick<Progress, 'box' | 'dueAt'>, now: number): number {
  const daysOver = (p: Pick<Progress, 'dueAt'>) => Math.floor((now - Date.parse(p.dueAt)) / DAY_MS);
  return daysOver(b) - daysOver(a) || a.box - b.box || Date.parse(a.dueAt) - Date.parse(b.dueAt);
}

/** Picks the word to revisit from a list of candidates (only due, known words count). */
export function pickRevisit<T extends Pick<Progress, 'box' | 'dueAt'> & { slug: string }>(
  candidates: T[],
  known: (slug: string) => boolean,
  now: number,
): T | null {
  const due = candidates.filter((c) => known(c.slug) && isDue(c, now));
  return due.sort((a, b) => compareDue(a, b, now))[0] ?? null;
}

/** Merge rule (sign-in, and any two copies of the same word): the latest review wins. */
export function mergeProgress(a: Progress | undefined, b: Progress | undefined): Progress | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.lastReviewedAt) > Date.parse(a.lastReviewedAt) ? b : a;
}

/** Whole days until a word is due, rounded up (0 = due now). */
export function daysUntilDue(p: Pick<Progress, 'dueAt'>, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(p.dueAt) - now) / DAY_MS));
}

/** “tomorrow”, “in 3 days”, or “now”. */
export function returnsIn(p: Pick<Progress, 'dueAt'>, now: number): string {
  const d = daysUntilDue(p, now);
  return d === 0 ? 'now' : d === 1 ? 'tomorrow' : `in ${d} days`;
}

/** Validates an untrusted value (browser storage, the network) as a Progress row. */
export function asProgress(v: unknown): Progress | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const box = Number(o.box);
  if (typeof o.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.slug) || o.slug.length > 64) return null;
  if (!Number.isInteger(box) || box < 1 || box > 5) return null;
  if (typeof o.dueAt !== 'string' || typeof o.lastReviewedAt !== 'string') return null;
  if (Number.isNaN(Date.parse(o.dueAt)) || Number.isNaN(Date.parse(o.lastReviewedAt))) return null;
  return {
    slug: o.slug,
    box: box as Box,
    dueAt: o.dueAt,
    lastReviewedAt: o.lastReviewedAt,
    timesSeen: Math.max(0, Number(o.timesSeen) || 0),
    lapses: Math.max(0, Number(o.lapses) || 0),
  };
}
