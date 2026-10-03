import { describe, expect, test } from 'vitest';
import words from '../../src/data/words.json';
import { addDays, amsterdamDate, amsterdamHour, PEARL_EPOCH, pearlForDate, pearlOfTheDay, type ScheduledWord } from '../../shared/pearlOfTheDay';

const WORDS = words as ScheduledWord[];
/** The words present since day 0. Later words (batches) join later cycles, so the schedule's mechanics are tested on these. */
const BASE = WORDS.filter((w) => !w.added || w.added <= PEARL_EPOCH);
const days = (n: number, from = PEARL_EPOCH) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe('Amsterdam calendar day', () => {
  test('winter (CET, UTC+1): the day turns at 23:00 UTC', () => {
    expect(amsterdamDate(new Date('2026-12-14T22:59:59Z'))).toBe('2026-12-14');
    expect(amsterdamDate(new Date('2026-12-14T23:00:00Z'))).toBe('2026-12-15');
  });

  test('summer (CEST, UTC+2): the day turns at 22:00 UTC', () => {
    expect(amsterdamDate(new Date('2026-07-01T21:59:59Z'))).toBe('2026-07-01');
    expect(amsterdamDate(new Date('2026-07-01T22:00:00Z'))).toBe('2026-07-02');
  });

  test('spring-forward day (29 March 2026) is one calendar day, 23 hours long', () => {
    expect(amsterdamDate(new Date('2026-03-28T22:59:59Z'))).toBe('2026-03-28');
    expect(amsterdamDate(new Date('2026-03-28T23:00:00Z'))).toBe('2026-03-29');
    expect(amsterdamDate(new Date('2026-03-29T21:59:59Z'))).toBe('2026-03-29');
    expect(amsterdamDate(new Date('2026-03-29T22:00:00Z'))).toBe('2026-03-30');
  });

  test('fall-back day (25 October 2026) is one calendar day, 25 hours long', () => {
    expect(amsterdamDate(new Date('2026-10-24T21:59:59Z'))).toBe('2026-10-24');
    expect(amsterdamDate(new Date('2026-10-24T22:00:00Z'))).toBe('2026-10-25');
    expect(amsterdamDate(new Date('2026-10-25T22:59:59Z'))).toBe('2026-10-25');
    expect(amsterdamDate(new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-26');
  });

  test('the 07:00 send hour follows DST', () => {
    expect(amsterdamHour(new Date('2026-07-01T05:30:00Z'))).toBe(7); // CEST
    expect(amsterdamHour(new Date('2026-12-01T06:30:00Z'))).toBe(7); // CET
    expect(amsterdamHour(new Date('2026-12-01T05:30:00Z'))).toBe(6);
  });

  test('the pearl changes exactly at Amsterdam midnight, the same for site and sender', () => {
    const before = pearlOfTheDay(WORDS, new Date('2026-12-14T22:59:59Z'));
    const after = pearlOfTheDay(WORDS, new Date('2026-12-14T23:00:00Z'));
    expect(before.date).toBe('2026-12-14');
    expect(after.date).toBe('2026-12-15');
    expect(before.slug).toBe(pearlForDate('2026-12-14', WORDS));
    expect(after.slug).toBe(pearlForDate('2026-12-15', WORDS));
  });
});

describe('schedule', () => {
  test('deterministic: the same date always gives the same word', () => {
    for (const d of days(30)) expect(pearlForDate(d, BASE)).toBe(pearlForDate(d, [...BASE].reverse()));
  });

  test('every word gets its day before any repeats, cycle after cycle', () => {
    const n = BASE.length;
    for (let cycle = 0; cycle < 3; cycle++) {
      const slugs = days(n, addDays(PEARL_EPOCH, cycle * n)).map((d) => pearlForDate(d, BASE));
      expect(new Set(slugs).size).toBe(n);
    }
  });

  test('no word two days in a row across a cycle boundary', () => {
    const n = BASE.length;
    for (let cycle = 1; cycle < 6; cycle++) {
      const boundary = addDays(PEARL_EPOCH, cycle * n);
      expect(pearlForDate(boundary, BASE)).not.toBe(pearlForDate(addDays(boundary, -1), BASE));
    }
  });

  test('adding words mid-cycle changes nothing already scheduled; they join the next cycle', () => {
    const n = BASE.length;
    const today = addDays(PEARL_EPOCH, 200); // part-way through the second cycle
    const grown: ScheduledWord[] = [...BASE, { slug: 'new-one', added: today }, { slug: 'new-two', added: today }];
    const nextCycle = addDays(PEARL_EPOCH, 2 * n);
    // Everything up to the end of the current cycle is identical…
    for (const d of days(2 * n)) expect(pearlForDate(d, grown)).toBe(pearlForDate(d, BASE));
    // …and the next cycle includes the new words exactly once.
    const next = days(n + 2, nextCycle).map((d) => pearlForDate(d, grown));
    expect(new Set(next).size).toBe(n + 2);
    expect(next).toContain('new-one');
    expect(next).toContain('new-two');
  });

  test('a word added on a cycle start day joins that cycle, not earlier ones', () => {
    const n = BASE.length;
    const start = addDays(PEARL_EPOCH, n);
    const grown: ScheduledWord[] = [...BASE, { slug: 'fresh', added: start }];
    for (const d of days(n)) expect(pearlForDate(d, grown)).toBe(pearlForDate(d, BASE));
    expect(days(n + 1, start).map((d) => pearlForDate(d, grown))).toContain('fresh');
  });
});
