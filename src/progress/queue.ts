import { compareDue, isDue, type Box, type Progress } from '../../shared/mastery';

/**
 * The sea's queue once progress is known. `order[0]` is the focused card and is never moved
 * (Pearl of the Day on “/”, a deep link's word). Behind it:
 *   1. in-session returns (“still learning” words coming back this visit), where they already are;
 *   2. new and due words, about one due word (most overdue, lowest box first) per two new words,
 *      the new ones in a per-user shuffled order;
 *   3. known words that aren't due, soonest first: only reached once everything else is met.
 */

export type ProgressMap = Readonly<Record<string, Progress>>;

/** Due words interleaved after this many new words. */
export const NEW_PER_DUE = 2;

/** 32-bit FNV-1a, enough to give each person their own stable shuffle. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function shuffleFor(seed: string, slugs: string[]): string[] {
  return slugs
    .map((s) => ({ s, k: hash(`${seed}:${s}`) }))
    .sort((a, b) => a.k - b.k || (a.s < b.s ? -1 : 1))
    .map((x) => x.s);
}

/** A word needs attention when it has never been swiped or is due again. */
export const isFresh = (p: Progress | undefined, now: number) => !p || isDue(p, now);

/** Interleaves new and due words: `sinceDue` new words have already gone by since the last due one. */
export function interleave(fresh: string[], due: string[], sinceDue = 0): string[] {
  const out: string[] = [];
  let n = sinceDue;
  let i = 0;
  let j = 0;
  while (i < fresh.length || j < due.length) {
    if (j < due.length && (n >= NEW_PER_DUE || i >= fresh.length)) {
      out.push(due[j++]);
      n = 0;
    } else {
      out.push(fresh[i++]);
      n++;
    }
  }
  return out;
}

const byDueTime = (progress: ProgressMap) => (a: string, b: string) =>
  Date.parse(progress[a].dueAt) - Date.parse(progress[b].dueAt) || (a < b ? -1 : 1);

/**
 * Builds the whole order from scratch (when progress loads, or after sign-in or a reset). The
 * focused card stays first and in-session returns keep their places.
 */
export function planOrder({
  slugs,
  progress,
  order,
  returning,
  seed,
  now,
  sinceDue = 0,
}: {
  /** Every live word. */
  slugs: string[];
  progress: ProgressMap;
  /** The current order; `order[0]` is the focused card. */
  order: string[];
  /** In-session returns (“still learning” words still coming back this visit). */
  returning: ReadonlySet<string>;
  seed: string;
  now: number;
  sinceDue?: number;
}): string[] {
  const focused = order[0];
  const rest = slugs.filter((s) => s !== focused && !returning.has(s));
  const unseen = shuffleFor(seed, rest.filter((s) => !progress[s]));
  const due = rest.filter((s) => progress[s] && isDue(progress[s], now)).sort((a, b) => compareDue(progress[a], progress[b], now));
  const known = rest.filter((s) => progress[s] && !isDue(progress[s], now)).sort(byDueTime(progress));
  const out = [focused, ...interleave(unseen, due, sinceDue), ...known];
  order.forEach((s, i) => {
    if (i > 0 && returning.has(s)) out.splice(Math.min(i, out.length), 0, s);
  });
  return out;
}

/**
 * After a swipe: keep the focused card and the order of everything still fresh (or returning this
 * visit), and move known words that aren't due to the back, soonest first.
 */
export function settleOrder(order: string[], progress: ProgressMap, returning: ReadonlySet<string>, now: number): string[] {
  const [focused, ...rest] = order;
  const front = rest.filter((s) => returning.has(s) || isFresh(progress[s], now));
  const known = rest.filter((s) => !returning.has(s) && !isFresh(progress[s], now)).sort(byDueTime(progress));
  return [focused, ...front, ...known];
}

/** Nothing new and nothing due anywhere in the sea (in-session returns included). */
export function metEveryPearl(order: string[], progress: ProgressMap, returning: ReadonlySet<string>, now: number): boolean {
  return order.length > 0 && order.every((s) => !returning.has(s) && !isFresh(progress[s], now));
}

// ---------------------------------------------------------------------------------------------
// Depth

/** Where unseen words float: mid-water. */
export const UNSEEN_DEPTH = 0.4;
const BOX_DEPTH: Record<Box, number> = { 1: 0.12, 2: 0.5, 3: 0.64, 4: 0.78, 5: 0.92 };

/** 0 = near the light … 1 = the deep. Words you're learning stay high; higher boxes sit deeper. */
export function depthOf(box: Box | undefined): number {
  return box ? BOX_DEPTH[box] : UNSEEN_DEPTH;
}

/** How much the whole sea darkens when every word is known. Never more: the sea must stay readable. */
export const SEA_DEEPEN_CAP = 0.3;

/** Share of live words that are known (box 2 or higher). */
export function knownShare(slugs: string[], progress: ProgressMap): number {
  if (!slugs.length) return 0;
  return slugs.filter((s) => (progress[s]?.box ?? 0) >= 2).length / slugs.length;
}

/** The sea's overall deepening for a known share (0–1), capped. */
export function seaDeepening(share: number): number {
  return Math.min(Math.max(share, 0), 1) * SEA_DEEPEN_CAP;
}
