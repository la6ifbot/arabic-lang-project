import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ANATOMY_TEACH_KEY } from '../../src/account/storageKeys';
import { letterHint, noteLetterTap, parseTeach, shouldTeach, takeTeach, TEACH_TIMES } from '../../src/lib/anatomyTeach';

// Phase 0.8, decisions 8 and 9: the letters' hint wording and the "show the teaching animation?" logic.

describe('shouldTeach', () => {
  test('plays the first 3 times, then never', () => {
    expect(TEACH_TIMES).toBe(3);
    expect([0, 1, 2, 3, 4].map((shown) => shouldTeach({ shown, tapped: false }, false))).toEqual([true, true, true, false, false]);
  });
  test('never after a letter tap', () => {
    expect(shouldTeach({ shown: 0, tapped: true }, false)).toBe(false);
  });
  test('never with reduced motion', () => {
    expect(shouldTeach({ shown: 0, tapped: false }, true)).toBe(false);
  });
});

describe('parseTeach', () => {
  test('anything unreadable is a first visit', () => {
    for (const raw of [null, '', 'nope', '42', '[]', '{"shown":"x"}', '{"shown":-3}'])
      expect(parseTeach(raw)).toEqual({ shown: 0, tapped: false });
  });
  test('reads what was saved', () => {
    expect(parseTeach('{"shown":2,"tapped":true}')).toEqual({ shown: 2, tapped: true });
  });
});

describe('remembered per device', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  test('three openings play it, the fourth does not', () => {
    expect([1, 2, 3, 4].map(() => takeTeach(false))).toEqual([true, true, true, false]);
    expect(JSON.parse(store.get(ANATOMY_TEACH_KEY)!)).toEqual({ shown: 3, tapped: false });
  });
  test('a letter tap stops it for good', () => {
    expect(takeTeach(false)).toBe(true);
    noteLetterTap();
    expect(takeTeach(false)).toBe(false);
  });
  test('reduced motion neither plays nor uses up a showing', () => {
    expect(takeTeach(true)).toBe(false);
    expect(store.has(ANATOMY_TEACH_KEY)).toBe(false);
  });
  test('blocked storage: it plays, and nothing throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(takeTeach(false)).toBe(true);
    expect(() => noteLetterTap()).not.toThrow();
  });
});

test('the hint says tap for a finger and click for a mouse', () => {
  expect(letterHint(true)).toBe('Tap a letter to see its four shapes.');
  expect(letterHint(false)).toBe('Click a letter to see its four shapes.');
});
