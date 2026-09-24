/**
 * Pearl of the Day: one word per calendar day in Europe/Amsterdam, the same for everyone.
 * Shared by the site and the email sender so they can never disagree.
 *
 * Schedule: days are grouped into cycles. Each cycle shows every word that existed when the cycle
 * began exactly once, in an order derived from hashing (cycle number, slug), so no word repeats
 * until all have had their day. A word added later carries `added: "YYYY-MM-DD"` and joins the
 * first cycle that starts after that date. Past days, and the rest of the current cycle, never change.
 */

export const PEARL_TIME_ZONE = 'Europe/Amsterdam';
/** Day 0 of the schedule (the day Pearl of the Day launched). */
export const PEARL_EPOCH = '2026-09-24';

export interface ScheduledWord {
  slug: string;
  /** ISO date the word was added to the dataset; absent for the original set. */
  added?: string;
}

const DAY_MS = 86_400_000;

/** Calendar date (YYYY-MM-DD) in Amsterdam at the given instant. DST-aware via Intl. */
export function amsterdamDate(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PEARL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Hour of day (0–23) in Amsterdam at the given instant. */
export function amsterdamHour(at: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: PEARL_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(at);
  return Number(h);
}

const toDayNumber = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Invalid date: ${iso}`);
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
};

export const addDays = (iso: string, n: number) => new Date((toDayNumber(iso) + n) * DAY_MS).toISOString().slice(0, 10);

/** 53-bit string hash (cyrb53): stable across platforms, good enough to shuffle. */
function hash(s: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

interface Cycle {
  index: number;
  start: number; // day number
  order: string[];
}

function cycleOrder(index: number, words: ScheduledWord[], startIso: string, previousLast?: string): string[] {
  const members = words.filter((w) => !w.added || w.added <= startIso).map((w) => w.slug);
  const order = members
    .map((slug) => ({ slug, key: hash(`${index}:${slug}`) }))
    .sort((a, b) => a.key - b.key || (a.slug < b.slug ? -1 : 1))
    .map((x) => x.slug);
  // Never show the same word on the last day of one cycle and the first day of the next.
  if (order.length > 1 && order[0] === previousLast) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

/** The slug shown on a given Amsterdam calendar date. */
export function pearlForDate(dateIso: string, words: ScheduledWord[]): string {
  if (!words.length) throw new Error('No words to schedule');
  const epoch = toDayNumber(PEARL_EPOCH);
  const day = toDayNumber(dateIso);
  if (day < epoch) {
    // Before launch: reuse the first cycle's order (only relevant for odd clocks and tests).
    const order = cycleOrder(0, words, PEARL_EPOCH);
    return order[(((day - epoch) % order.length) + order.length) % order.length];
  }
  let cycle: Cycle = { index: 0, start: epoch, order: cycleOrder(0, words, PEARL_EPOCH) };
  while (day >= cycle.start + cycle.order.length) {
    const start = cycle.start + cycle.order.length;
    const startIso = new Date(start * DAY_MS).toISOString().slice(0, 10);
    cycle = { index: cycle.index + 1, start, order: cycleOrder(cycle.index + 1, words, startIso, cycle.order.at(-1)) };
  }
  return cycle.order[day - cycle.start];
}

/** Today's pearl (or at a given instant). */
export function pearlOfTheDay(words: ScheduledWord[], at: Date = new Date()): { date: string; slug: string } {
  const date = amsterdamDate(at);
  return { date, slug: pearlForDate(date, words) };
}
