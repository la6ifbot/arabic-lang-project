import { describe, expect, test } from 'vitest';
import {
  asProgress,
  BOX_DAYS,
  compareDue,
  DAY_MS,
  isDue,
  mergeProgress,
  pickRevisit,
  returnsIn,
  review,
  type Box,
  type Progress,
} from '../../shared/mastery';
import {
  depthOf,
  interleave,
  knownShare,
  metEveryPearl,
  planOrder,
  SEA_DEEPEN_CAP,
  seaDeepening,
  settleOrder,
  shuffleFor,
  UNSEEN_DEPTH,
} from '../../src/progress/queue';

const T0 = Date.parse('2026-10-01T08:00:00Z');
const days = (n: number) => n * DAY_MS;

function at(slug: string, box: Box, dueIn: number, reviewedAgo = 0): Progress {
  return {
    slug,
    box,
    dueAt: new Date(T0 + dueIn).toISOString(),
    lastReviewedAt: new Date(T0 - reviewedAgo).toISOString(),
    timesSeen: 1,
    lapses: 0,
  };
}

describe('schedule: box rules', () => {
  test('first swipe: right → box 2 (3 days), left → box 1 (1 day)', () => {
    const r = review('bahr', undefined, 'known', T0);
    expect(r).toMatchObject({ box: 2, timesSeen: 1, lapses: 0 });
    expect(Date.parse(r.dueAt) - T0).toBe(days(3));
    const l = review('bahr', undefined, 'learning', T0);
    expect(l).toMatchObject({ box: 1, timesSeen: 1, lapses: 0 });
    expect(Date.parse(l.dueAt) - T0).toBe(days(1));
  });

  test('right moves up one box, each with its interval: 1, 3, 7, 16, 35 days', () => {
    expect(BOX_DAYS).toEqual({ 1: 1, 2: 3, 3: 7, 4: 16, 5: 35 });
    let p = review('bahr', undefined, 'learning', T0);
    const seen: [number, number][] = [];
    for (let i = 0; i < 4; i++) {
      const t = T0 + days(i + 1) * 10;
      p = review('bahr', p, 'known', t);
      seen.push([p.box, (Date.parse(p.dueAt) - t) / DAY_MS]);
    }
    expect(seen).toEqual([
      [2, 3],
      [3, 7],
      [4, 16],
      [5, 35],
    ]);
  });

  test('box 5 is the ceiling', () => {
    const p = review('bahr', at('bahr', 5, 0), 'known', T0);
    expect(p.box).toBe(5);
    expect(Date.parse(p.dueAt) - T0).toBe(days(35));
  });

  test('left sends any box back to 1 and counts a lapse; due_at is recalculated every time', () => {
    const p = review('bahr', { ...at('bahr', 4, 0), lapses: 2, timesSeen: 7 }, 'learning', T0);
    expect(p).toMatchObject({ box: 1, lapses: 3, timesSeen: 8, lastReviewedAt: new Date(T0).toISOString() });
    expect(Date.parse(p.dueAt) - T0).toBe(days(1));
  });

  test('due means due_at <= now, to the millisecond (no calendar days)', () => {
    const p = at('bahr', 2, 0);
    expect(isDue(p, T0)).toBe(true);
    expect(isDue(p, T0 - 1)).toBe(false);
  });

  test('“returns tomorrow / in N days / now”', () => {
    expect(returnsIn(at('x', 1, days(1)), T0)).toBe('tomorrow');
    expect(returnsIn(at('x', 2, days(3)), T0)).toBe('in 3 days');
    expect(returnsIn(at('x', 2, days(2.2)), T0)).toBe('in 3 days');
    expect(returnsIn(at('x', 2, -5), T0)).toBe('now');
  });
});

describe('merge rule', () => {
  test('the latest last_reviewed_at wins, whichever side it is on', () => {
    const older = at('bahr', 5, days(30), days(2));
    const newer = at('bahr', 1, days(1), days(1));
    expect(mergeProgress(older, newer)).toBe(newer);
    expect(mergeProgress(newer, older)).toBe(newer);
    expect(mergeProgress(undefined, older)).toBe(older);
    expect(mergeProgress(older, undefined)).toBe(older);
  });

  test('untrusted rows are validated', () => {
    expect(asProgress({ slug: 'bahr', box: 3, dueAt: '2026-10-01T00:00:00Z', lastReviewedAt: '2026-09-01T00:00:00Z' })).toMatchObject({ box: 3 });
    expect(asProgress({ slug: 'bahr', box: 6, dueAt: '2026-10-01T00:00:00Z', lastReviewedAt: '2026-09-01T00:00:00Z' })).toBeNull();
    expect(asProgress({ slug: '<b>', box: 1, dueAt: '2026-10-01T00:00:00Z', lastReviewedAt: '2026-09-01T00:00:00Z' })).toBeNull();
    expect(asProgress({ slug: 'bahr', box: 1, dueAt: 'soon', lastReviewedAt: '2026-09-01T00:00:00Z' })).toBeNull();
    expect(asProgress('nope')).toBeNull();
  });
});

describe('due ordering (shared by the queue and the email)', () => {
  test('most overdue first, then the lowest box', () => {
    const list = [at('a', 3, -days(1)), at('b', 1, -days(1) - 3600_000), at('c', 2, -days(4)), at('d', 1, -60_000)];
    expect(list.sort((x, y) => compareDue(x, y, T0)).map((p) => p.slug)).toEqual(['c', 'b', 'a', 'd']);
  });

  test('pickRevisit skips retired words and words not yet due', () => {
    const cands = [at('retired', 1, -days(9)), at('later', 1, days(1)), at('sabr', 3, -days(2)), at('ward', 2, -days(2))];
    expect(pickRevisit(cands, (s) => s !== 'retired', T0)?.slug).toBe('ward');
    expect(pickRevisit([at('later', 1, days(1))], () => true, T0)).toBeNull();
  });
});

describe('queue', () => {
  const words = ['n1', 'n2', 'n3', 'n4', 'n5', 'd1', 'd2', 'k1', 'k2', 'potd'];
  const progress = {
    d1: at('d1', 3, -days(1)),
    d2: at('d2', 1, -days(3)),
    k1: at('k1', 4, days(10)),
    k2: at('k2', 2, days(2)),
    retired: at('retired', 1, -days(40)),
  };

  test('interleaves about one due word per two new words', () => {
    expect(interleave(['a', 'b', 'c', 'd', 'e'], ['X', 'Y'])).toEqual(['a', 'b', 'X', 'c', 'd', 'Y', 'e']);
    expect(interleave(['a'], ['X', 'Y'])).toEqual(['a', 'X', 'Y']);
    expect(interleave([], ['X'])).toEqual(['X']);
    // Two new words already went by: the next one is due.
    expect(interleave(['a', 'b'], ['X'], 2)).toEqual(['X', 'a', 'b']);
  });

  test('the focused card (Pearl of the Day) stays first; due words most overdue first; known-not-due last', () => {
    const order = planOrder({ slugs: words, progress, order: ['potd', ...words.filter((w) => w !== 'potd')], returning: new Set(), seed: 'u1', now: T0 });
    expect(order[0]).toBe('potd');
    expect(order).toHaveLength(words.length);
    expect(order.filter((s) => s.startsWith('d'))).toEqual(['d2', 'd1']);
    expect(order.slice(-2)).toEqual(['k2', 'k1']);
    // Pattern: new, new, due, new, new, due, new…
    const kinds = order.slice(1, 8).map((s) => s[0]);
    expect(kinds).toEqual(['n', 'n', 'd', 'n', 'n', 'd', 'n']);
    expect(order).not.toContain('retired');
  });

  test('new words come in a per-user shuffled order, stable for that user', () => {
    const a = shuffleFor('user-a', words);
    expect(shuffleFor('user-a', words)).toEqual(a);
    expect(shuffleFor('user-b', words)).not.toEqual(a);
    expect([...a].sort()).toEqual([...words].sort());
  });

  test('in-session returns keep their place when the queue is rebuilt', () => {
    const order = ['potd', 'n1', 'n2', 'n3', 'd1', 'n4', 'n5', 'd2', 'k1', 'k2'];
    const planned = planOrder({ slugs: words, progress, order, returning: new Set(['n3']), seed: 'u1', now: T0 });
    expect(planned.indexOf('n3')).toBe(3);
    expect(planned).toHaveLength(words.length);
  });

  test('after a swipe, known words that aren’t due move to the back, soonest first', () => {
    const p = { ...progress, n1: at('n1', 2, days(3)) };
    const settled = settleOrder(['n2', 'k1', 'n1', 'd1', 'n3', 'k2'], p, new Set(), T0);
    expect(settled).toEqual(['n2', 'd1', 'n3', 'k2', 'n1', 'k1']);
    // Unless it is still coming back this visit.
    expect(settleOrder(['n2', 'n1', 'd1'], p, new Set(['n1']), T0)).toEqual(['n2', 'n1', 'd1']);
  });

  test('“met every pearl” only when nothing is new, due or returning', () => {
    const p = { a: at('a', 2, days(3)), b: at('b', 1, days(1)) };
    expect(metEveryPearl(['a', 'b'], p, new Set(), T0)).toBe(true);
    expect(metEveryPearl(['a', 'b'], p, new Set(['b']), T0)).toBe(false);
    expect(metEveryPearl(['a', 'b', 'c'], p, new Set(), T0)).toBe(false);
    expect(metEveryPearl(['a', 'b'], p, new Set(), T0 + days(1))).toBe(false);
  });
});

describe('depth', () => {
  test('learning words stay near the light, unseen words mid-water, higher boxes deeper', () => {
    const d = [depthOf(1), depthOf(undefined), depthOf(2), depthOf(3), depthOf(4), depthOf(5)];
    expect(depthOf(undefined)).toBe(UNSEEN_DEPTH);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...d)).toBeLessThanOrEqual(1);
  });

  test('the sea deepens with the share of known words, and never past the cap', () => {
    expect(seaDeepening(0)).toBe(0);
    expect(seaDeepening(0.5)).toBeCloseTo(SEA_DEEPEN_CAP / 2);
    expect(seaDeepening(1)).toBe(SEA_DEEPEN_CAP);
    expect(seaDeepening(7)).toBe(SEA_DEEPEN_CAP);
    expect(SEA_DEEPEN_CAP).toBeLessThanOrEqual(0.3);
  });

  test('known share counts box 2+ among live words only', () => {
    const p = { a: at('a', 1, 0), b: at('b', 2, 0), c: at('c', 5, 0), gone: at('gone', 5, 0) };
    expect(knownShare(['a', 'b', 'c', 'd'], p)).toBe(0.5);
    expect(knownShare([], p)).toBe(0);
  });
});
