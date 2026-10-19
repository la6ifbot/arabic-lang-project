import { describe, expect, test } from 'vitest';
import { applyMerge, applyReview, deepScore, generatedName, nameKey, nameShapeProblem, weekStart, type ServerRow } from '../../shared/deep';
import { DAY_MS } from '../../shared/mastery';

const T0 = Date.parse('2026-10-05T08:00:00Z');

describe('applyReview: scoring and due-gating (record_review)', () => {
  test('a new word: right → box 2, left → box 1, both verified', () => {
    expect(applyReview(undefined, 'bahr', 'known', T0).row).toMatchObject({ box: 2, verifiedBox: 2 });
    expect(applyReview(undefined, 'bahr', 'learning', T0).row).toMatchObject({ box: 1, verifiedBox: 1, lapses: 0 });
  });

  test('right on a word that isn’t due moves nothing', () => {
    const first = applyReview(undefined, 'bahr', 'known', T0).row;
    const again = applyReview(first, 'bahr', 'known', T0 + DAY_MS);
    expect(again.moved).toBe(false);
    expect(again.row).toBe(first);
  });

  test('reaching box 5 takes about four weeks of returning', () => {
    let row = applyReview(undefined, 'bahr', 'known', T0).row;
    let t = T0;
    for (const days of [3, 7, 16]) {
      t += days * DAY_MS;
      row = applyReview(row, 'bahr', 'known', t).row;
    }
    expect([row.box, row.verifiedBox]).toEqual([5, 5]);
    expect((t - T0) / DAY_MS).toBe(26);
  });

  test('left resets to box 1 with a lapse, verified', () => {
    const deep = { ...applyReview(undefined, 'bahr', 'known', T0).row, box: 4, verifiedBox: 4 } as ServerRow;
    expect(applyReview(deep, 'bahr', 'learning', T0).row).toMatchObject({ box: 1, verifiedBox: 1, lapses: 1 });
  });
});

describe('verified merge (save_progress)', () => {
  const browser = (box: 1 | 2 | 3 | 4 | 5, dueIn: number, reviewed = T0) => ({
    slug: 'sabr',
    box,
    dueAt: new Date(T0 + dueIn).toISOString(),
    lastReviewedAt: new Date(reviewed).toISOString(),
    timesSeen: 3,
    lapses: 0,
  });

  test('merged words keep their box for the person but start unverified', () => {
    expect(applyMerge(undefined, browser(4, DAY_MS))).toMatchObject({ box: 4, verifiedBox: 0 });
  });

  test('the next real review verifies it from box 2, whatever box the browser claimed', () => {
    const merged = applyMerge(undefined, browser(4, -DAY_MS));
    expect(applyReview(merged, 'sabr', 'known', T0).row).toMatchObject({ box: 5, verifiedBox: 2 });
  });

  test('a re-merged "due" copy can’t push the verified box early', () => {
    const verified = applyReview(applyMerge(undefined, browser(4, -DAY_MS)), 'sabr', 'known', T0).row;
    const remerged = applyMerge(verified, browser(5, -10 * DAY_MS, T0 + 1000));
    expect(applyReview(remerged, 'sabr', 'known', T0 + 2000).row.verifiedBox).toBe(2);
  });

  test('an older copy is ignored; a newer lower box lowers the verified box', () => {
    const v = applyReview(undefined, 'sabr', 'known', T0).row;
    expect(applyMerge(v, browser(5, 0, T0 - DAY_MS))).toBe(v);
    expect(applyMerge(v, browser(1, DAY_MS, T0 + DAY_MS)).verifiedBox).toBe(1);
  });

  test('depth adds up verified boxes; pearls are verified box 2+', () => {
    expect(deepScore([{ verifiedBox: 0 }, { verifiedBox: 1 }, { verifiedBox: 2 }, { verifiedBox: 5 }])).toEqual({ depth: 8, pearls: 2 });
  });
});

describe('names', () => {
  test.each([
    ['Layla', null],
    ['  Layla   of  the sea ', null],
    ['لؤلؤة البحر', null],
    ['غَوّاصة', null],
    ['Dāna_7', null],
    ['Ab', 'length'],
    ['An extremely long diver name', 'length'],
    ['Layla🌊', 'characters'],
    ['Lay‮la', 'characters'],
    ['_Layla', 'characters'],
    ['La--yla', 'characters'],
    ['123', 'characters'],
    ['َabc', 'characters'],
    ['Layla لؤلؤة', 'mixed'],
    ['Diver 142', 'reserved'],
    ['diver_77', 'reserved'],
    ['غوّاص ١٤٢', 'reserved'],
  ])('%j → %s', (name, want) => {
    expect(nameShapeProblem(name)).toBe(want);
  });

  test('keys fold case, Arabic marks, letter variants, digits and separators', () => {
    expect(nameKey('Dāna_7')).toBe(nameKey('dāna 7'));
    expect(nameKey('غوّاص ١٤٢')).toBe('غواص 142');
    expect(nameKey('أمل')).toBe(nameKey('امل'));
    expect(nameKey('Layla.Of-The  Sea')).toBe('layla of the sea');
  });

  test('generated names', () => {
    expect(generatedName(142, 'latin')).toBe('Diver 142');
    expect(generatedName(142, 'arabic')).toBe('غوّاص ١٤٢');
  });
});

describe('the week (Monday 00:00 Amsterdam) across DST', () => {
  test.each([
    ['2026-10-25T22:59:00Z', '2026-10-19'], // Sunday 23:59 CET, the day summer time ended
    ['2026-10-25T23:00:00Z', '2026-10-26'], // Monday 00:00 CET
    ['2027-03-28T21:59:00Z', '2027-03-22'], // Sunday 23:59 CEST, the day summer time began
    ['2027-03-28T22:00:00Z', '2027-03-29'], // Monday 00:00 CEST
    ['2026-10-14T12:00:00Z', '2026-10-12'],
  ])('%s → %s', (at, want) => {
    expect(weekStart(Date.parse(at))).toBe(want);
  });
});
