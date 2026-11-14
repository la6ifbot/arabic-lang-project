import { describe, expect, it } from 'vitest';
import { parseWordTap, wordHint } from '../../src/lib/wordTap';

describe('“tap the word” memory', () => {
  it('reads what the device remembers, and treats anything else as a first visit', () => {
    expect(parseWordTap('{"tapped":true,"hinted":true}')).toEqual({ tapped: true, hinted: true });
    expect(parseWordTap('{"hinted":true}')).toEqual({ tapped: false, hinted: true });
    for (const raw of [null, '', 'nope', '[]', '42', '{"tapped":"yes"}']) expect(parseWordTap(raw)).toEqual({ tapped: false, hinted: false });
  });
  it('words the hint for the pointer in use', () => {
    expect(wordHint(true)).toBe('Tap the word to see its letters');
    expect(wordHint(false)).toBe('Click the word to see its letters');
  });
});
