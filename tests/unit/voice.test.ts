import { describe, expect, test } from 'vitest';
import words from '../../src/data/words.json';
import { fullWord } from '../../src/lib/wordDetails';
import { VOICE, speech, speechSsml, wordAudio } from '../../shared/audio';
import { cost, speechJobs, spotCheck } from '../../scripts/voice.mjs';
import { sayError, validateWords } from '../../scripts/lib/word-schema.mjs';
import { rowsToWords, wordsToRows } from '../../scripts/lib/sheet.mjs';
import topics from '../../src/data/topics.json';
import type { Word } from '../../src/types';

const WORDS = words as Word[];
const durrah = WORDS.find((w) => w.slug === 'durrah')!;

describe('audio keys (shared/audio.ts)', () => {
  test('are worked out from the text, in the chosen voice’s folder', () => {
    const a = wordAudio(durrah);
    expect(a.word).toMatch(new RegExp(`^audio/${VOICE.id}/[0-9a-f]{12}\\.mp3$`));
    expect(a.examples).toHaveLength(durrah.examples.length);
    expect(wordAudio(structuredClone(durrah))).toEqual(a);
  });

  test('change with the text, the override, a new take and the voice, and only then', () => {
    const k = speech(durrah).key;
    expect(speech({ ar: 'دُرَّةٌ' }).key).not.toBe(k);
    expect(speech({ ...durrah, say: { ar: 'دُرَّهْ' } }).key).not.toBe(k);
    expect(speech({ ...durrah, say: { take: 2 } }).key).not.toBe(k);
    expect(speech(durrah, { id: 'hala', name: 'Hala', engine: 'neural' }).key).not.toBe(k);
    expect(speech({ ...durrah, meanings: ['x'] } as Word).key).toBe(k);
  });

  test('the SSML reads Standard Arabic, escapes the text and uses the override', () => {
    expect(speechSsml({ ar: 'دُرَّة' }).ssml).toBe('<speak><lang xml:lang="arb">دُرَّة</lang></speak>');
    expect(speechSsml({ ar: 'a<b' }).ssml).toContain('a&lt;b');
    expect(speechSsml({ ar: 'دُرَّة', say: { ar: 'دُرّه' } }).ssml).toContain('>دُرّه<');
    expect(speechSsml({ ar: 'دُرَّة', say: { ipa: 'durra' } }).ssml).toContain('<phoneme alphabet="ipa" ph="durra">دُرَّة</phoneme>');
    expect(speechSsml({ ar: 'دُرَّة' }).chars).toBe(6);
  });

  test('every headword and every sentence has a file to make', () => {
    const jobs = speechJobs(WORDS);
    const keys = new Set(jobs.map((j) => j.key));
    for (const w of WORDS) {
      const a = wordAudio(w);
      expect(keys.has(a.word)).toBe(true);
      for (const k of a.examples) expect(keys.has(k)).toBe(true);
    }
    // The whole set stays far under the $5 check-in line (decision 1).
    expect(cost(jobs.reduce((n, j) => n + j.chars, 0), 'neural')).toBeLessThan(1);
  });
});

describe('the spot-check list (decision 3)', () => {
  test('picks the headwords a voice is most likely to misread', () => {
    const list = spotCheck(WORDS);
    const why = (slug: string) => list.find((r) => r.slug === slug)?.why;
    expect(why('luulu')).toEqual(['hamza after the first letter']);
    expect(why('nada')).toEqual(['tanwīn', 'alif maqṣūra']);
    expect(why('dabaran')).toEqual(['shadda', 'al- (sun or moon letter)']);
    expect(why('mirah')).toContain('madda');
    expect(why('bahr')).toBeUndefined();
    expect(list.length).toBeGreaterThan(30);
    expect(list.length).toBeLessThan(120);
  });
});

describe('the site’s audio lookup (words.json?audio)', () => {
  test('gives every word its audio keys, and the word details never carry the pronunciation fixes', async () => {
    const { audioOf } = await import('../../src/lib/audioKeys');
    for (const w of WORDS) {
      expect(audioOf(w.slug)).toEqual(wordAudio(w));
      const full = fullWord(w.slug)!;
      expect(full.say).toBeUndefined();
      for (const ex of full.examples) expect(ex.say).toBeUndefined();
    }
    expect(audioOf('no-such-word')).toBeUndefined();
  });
});

describe('pronunciation fixes in words.json', () => {
  test('accept a spelling, sounds or a new take', () => {
    expect(sayError(undefined)).toBeNull();
    expect(sayError({ ar: 'دُرَّهْ' })).toBeNull();
    expect(sayError({ ipa: 'durra' })).toBeNull();
    expect(sayError({ take: 2 })).toBeNull();
    expect(sayError({ ar: 'دُرَّهْ', take: 3 })).toBeNull();
  });

  test('reject anything else', () => {
    for (const bad of [{}, 'دُرَّة', { ar: 'durra' }, { ar: 'دُرَّة', ipa: 'durra' }, { ipa: 'a"b' }, { take: 1 }, { take: 2.5 }, { voice: 'x' }])
      expect(sayError(bad)).not.toBeNull();
  });

  test('the validator checks them on words and sentences, and refuses a hand-written audio field', () => {
    const one = (patch: (w: Word) => void) => {
      const list = structuredClone(WORDS);
      patch(list[0]);
      return validateWords(list, topics).errors;
    };
    expect(one(() => {})).toEqual([]);
    expect(one((w) => (w.say = { ar: 'دُرَّهْ' }))).toEqual([]);
    expect(one((w) => (w.say = { take: 0 }))).toHaveLength(1);
    expect(one((w) => (w.examples[0].say = { ipa: '<x>' }))).toHaveLength(1);
    expect(one((w) => Object.assign(w, { audio: 'x.mp3' }))).toHaveLength(1);
  });

  test('survive a Sheet import while the sentence is unchanged', () => {
    const current = structuredClone(WORDS.slice(0, 3));
    current[0].say = { take: 2 };
    current[0].examples[0].say = { ar: 'هَذِهِ' };
    const rows = wordsToRows(current);
    const kept = rowsToWords(rows, current).words as Word[];
    expect(kept[0].say).toEqual({ take: 2 });
    expect(kept[0].examples[0].say).toEqual({ ar: 'هَذِهِ' });

    const edited = structuredClone(rows);
    edited[1][edited[0].indexOf('example_1_ar')] = 'جملة جديدة.';
    expect((rowsToWords(edited, current).words as Word[])[0].examples[0].say).toBeUndefined();
  });
});
