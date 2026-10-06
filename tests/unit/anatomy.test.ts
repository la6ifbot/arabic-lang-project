import { describe as group, expect, test } from 'vitest';
import words from '../../src/data/words.json';
import { anatomy, describe, joinSentence, LETTERS, positional, segment, shapes, spelled, ZWJ } from '../../shared/anatomy';
import { validateWords } from '../../scripts/lib/word-schema.mjs';
import topics from '../../src/data/topics.json';
import type { Word } from '../../src/types';

const names = (ar: string) => segment(ar).letters.map((l) => l.info.name.tr);
const joins = (ar: string) => segment(ar).letters.map((l) => l.joinsNext);
const sylls = (ar: string, translit?: string) => anatomy({ ar, translit }).syllables.map((s) => s.tr).join(' · ');

group('the letter table', () => {
  test('has the 28 letters, the hamzah forms, ة and ى, each once, with names and sounds', () => {
    const chars = LETTERS.map((l) => l.char);
    expect(new Set(chars).size).toBe(chars.length);
    expect(chars.join('')).toBe('ابتثجحخدذرزسشصضطظعغفقكلمنهويءأإآؤئةى');
    for (const l of LETTERS) {
      expect(l.name.ar).toMatch(/[؀-ۿ]/);
      expect(l.name.tr).toBeTruthy();
      expect(l.sound).toBeTruthy();
    }
  });

  test('marks exactly the letters that never join forward', () => {
    const neverForward = LETTERS.filter((l) => l.joins !== 'both').map((l) => l.char);
    expect(neverForward.sort()).toEqual([...'اأإآدذرزوؤءة'].sort());
    expect(LETTERS.find((l) => l.char === 'ء')!.joins).toBe('none');
  });

  test('draws four shapes with zero-width joiners', () => {
    const info = (c: string) => LETTERS.find((l) => l.char === c)!;
    expect(shapes(info('ب'))).toEqual({ alone: 'ب', start: `ب${ZWJ}`, middle: `${ZWJ}ب${ZWJ}`, end: `${ZWJ}ب` });
    // A letter that never joins forward starts a word as it stands alone, and sits mid-word as it ends one.
    expect(shapes(info('د'))).toEqual({ alone: 'د', start: 'د', middle: `${ZWJ}د`, end: `${ZWJ}د` });
    expect(shapes(info('ء'))).toEqual({ alone: 'ء', start: 'ء', middle: 'ء', end: 'ء' });
    expect(shapes(info('ة'))).toEqual({ alone: 'ة', start: null, middle: null, end: `${ZWJ}ة` });
  });
});

group('segmentation', () => {
  test('دُرَر is three letters that never touch', () => {
    const a = anatomy({ ar: 'دُرَر' });
    expect(a.count).toBe(3);
    expect(names('دُرَر')).toEqual(['dāl', 'rāʾ', 'rāʾ']);
    expect(joins('دُرَر')).toEqual([false, false, false]);
    expect(a.letters.map((l) => l.marks)).toEqual(['ُ', 'َ', '']);
    expect(joinSentence(a)).toBe('None of them join the next letter.');
  });

  test('the thread breaks after every letter that never joins forward', () => {
    for (const c of 'اأإآدذرزوؤ') {
      const { letters } = segment(`ب${c}ب`);
      expect(letters.map((l) => l.joinsNext), c).toEqual([true, false, false]);
      expect(letters.map((l) => l.form), c).toEqual(['start', 'end', 'alone']);
    }
    // ء joins nothing, on either side.
    expect(segment('بءب').letters.map((l) => l.form)).toEqual(['alone', 'alone', 'alone']);
  });

  test('لا counts as two letters, lām and alif', () => {
    const a = anatomy({ ar: 'هِلَال' });
    expect(a.count).toBe(4);
    expect(names('هِلَال')).toEqual(['hāʾ', 'lām', 'alif', 'lām']);
    expect(a.letters.map((l) => l.form)).toEqual(['start', 'middle', 'end', 'alone']);
    expect(positional(a.letters[1])).toBe(`${ZWJ}لَ${ZWJ}`);
  });

  test('a doubled letter counts once, marked doubled, and keeps its marks', () => {
    const a = anatomy({ ar: 'دُرَّة' });
    expect(a.count).toBe(3);
    expect(a.letters.map((l) => l.doubled)).toEqual([false, true, false]);
    expect(a.letters[1].marks).toBe('َّ'.normalize('NFC'));
    expect(describe(a)).toBe('دُرَّة, 3 letters: dāl, rāʾ (doubled), tāʾ marbūṭah. None of them join the next letter. Syllables: dur · rah.');
  });

  test('ة and ى are letters, and hamzah forms are named', () => {
    expect(anatomy({ ar: 'الشِّعْرَى' }).count).toBe(6);
    expect(names('مَرْسًى').at(-1)).toBe('alif maqṣūrah');
    expect(names('لُؤْلُؤ')).toEqual(['lām', 'hamzah on wāw', 'lām', 'hamzah on wāw']);
    expect(names('آخِر')[0]).toBe('alif maddah');
    expect(names('إِبْرِيق')[0]).toBe('hamzah under alif');
    expect(names('سَمَاء').at(-1)).toBe('hamzah');
    expect(names('شَقَائِق')[3]).toBe('hamzah on yāʾ');
  });

  test('spaces separate words; the thread never crosses them and they are not counted', () => {
    const a = anatomy({ ar: 'مَاء الوَرْد' });
    expect(a.count).toBe(8);
    expect(a.words).toBe(2);
    expect(a.letters[2].joinsNext).toBe(false);
    expect(a.letters[3].word).toBe(1);
  });

  test('reports characters that are not letters', () => {
    expect(segment('بx').errors[0]).toMatch(/not in the letter table/);
    expect(segment('َب').errors[0]).toMatch(/no letter/);
  });

  test('every letter in a joined pair: joinsNext matches the next letter’s joinsPrev', () => {
    for (const w of words as Word[]) {
      const { letters } = segment(w.ar);
      letters.forEach((l, i) => i > 0 && expect(letters[i - 1].joinsNext).toBe(l.joinsPrev));
    }
  });
});

group('syllables', () => {
  test('the examples from the checklist', () => {
    expect(sylls('دُرَر')).toBe('du · rar');
    expect(sylls('سَرَاب')).toBe('sa · rāb');
    expect(anatomy({ ar: 'سَرَاب' }).syllables.map((s) => s.ar)).toEqual(['سَ', 'رَاب']);
  });

  test('shadda splits across syllables; the bead shows sukun, then the vowel', () => {
    const a = anatomy({ ar: 'دُرَّة', translit: 'durrah' });
    expect(a.syllables.map((s) => s.tr)).toEqual(['dur', 'rah']);
    expect(a.syllables.map((s) => s.ar)).toEqual(['دُرْ', 'رَة']);
    expect(a.syllables[0].letters).toEqual([0, 1]);
    expect(a.syllables[1].letters).toEqual([1, 2]);
    expect(a.uncertain).toEqual([]);
    expect(sylls('ظِلّ')).toBe('ẓill');
  });

  test('long vowels, diphthongs, hamzah and the pause', () => {
    expect(sylls('هِلَال')).toBe('hi · lāl');
    expect(sylls('نُور')).toBe('nūr');
    expect(sylls('جَدْي')).toBe('jady');
    expect(sylls('لُؤْلُؤ')).toBe('luʾ · luʾ');
    expect(sylls('سَمَاء')).toBe('sa · māʾ');
    expect(sylls('آخِر')).toBe('ā · khir');
    expect(sylls('بَدَوِيّ')).toBe('ba · da · wī');
    expect(sylls('سُرَّة الفَرَس')).toBe('sur · rat · al · fa · ras');
  });

  test('tanwīn: -an before a final alif is said -ā; elsewhere it is flagged', () => {
    expect(anatomy({ ar: 'رِضًا', translit: 'riḍā' }).uncertain).toEqual([]);
    expect(sylls('رِضًا')).toBe('ri · ḍā');
    expect(sylls('نَدًى')).toBe('na · dā');
    expect(anatomy({ ar: 'كِتَابٌ' }).uncertain).toContain('tanwīn');
  });

  test('al-: assimilated before sun letters, flagged for review', () => {
    const sun = anatomy({ ar: 'الدَّبَرَان', translit: 'al dabarān' });
    expect(sun.syllables.map((s) => s.tr)).toEqual(['ad', 'da', 'ba', 'rān']);
    expect(sun.syllables[0].ar).toBe('الدْ');
    expect(sun.uncertain).toEqual(['has al-, “the”']);
    expect(sylls('الجَوْزَاء')).toBe('al · jaw · zāʾ');
  });

  test('a letter with no vowel mid-word is flagged; one before a long ā is not', () => {
    expect(anatomy({ ar: 'كتب' }).uncertain.some((u) => u.startsWith('no vowel'))).toBe(true);
    expect(anatomy({ ar: 'سمَا' }).uncertain.filter((u) => u.startsWith('no vowel on mīm'))).toEqual([]);
  });

  test('a disagreement with the card’s transliteration is flagged', () => {
    expect(anatomy({ ar: 'دُرَر', translit: 'durar' }).uncertain).toEqual([]);
    expect(anatomy({ ar: 'دُرَر', translit: 'dirar' }).uncertain[0]).toMatch(/the card says “dirar”/);
  });

  test('the syllables override replaces the automatic split', () => {
    const a = anatomy({ ar: 'الدَّبَرَان', syllables: [{ ar: 'الدْ', tr: 'ad' }, { ar: 'دَ', tr: 'da' }, { ar: 'بَ', tr: 'ba' }, { ar: 'رَان', tr: 'rān' }] });
    expect(a.syllableSource).toBe('override');
    expect(a.errors).toEqual([]);
    expect(a.uncertain).toEqual([]);
    expect(a.syllables.map((s) => s.letters)).toEqual([[0, 1, 2], [2], [3], [4, 5, 6]]);
    expect(spelled(a.syllables)).toBe('addabarān');
  });

  test('an override that does not fit the headword is an error', () => {
    expect(anatomy({ ar: 'دُرَر', syllables: [{ ar: 'دُ', tr: 'du' }] }).errors[0]).toMatch(/leave out/);
    expect(anatomy({ ar: 'دُرَر', syllables: [{ ar: 'بُ', tr: 'bu' }, { ar: 'رَر', tr: 'rar' }] }).errors[0]).toMatch(/doesn't match/);
  });

  test('the word schema accepts a well-formed override and rejects a malformed one', () => {
    const base = (words as Word[])[0];
    const ok = validateWords([{ ...base, syllables: [{ ar: 'دُرْ', tr: 'dur' }, { ar: 'رَة', tr: 'rah' }] }, ...(words as Word[]).slice(1)], topics);
    expect(ok.errors).toEqual([]);
    const bad = validateWords([{ ...base, syllables: 'dur·rah' }, ...(words as Word[]).slice(1)], topics);
    expect(bad.errors.join()).toMatch(/syllables must be/);
  });
});

test('every word in the sea breaks into known letters and syllables', () => {
  const flagged: string[] = [];
  for (const w of words as Word[]) {
    const a = anatomy(w);
    expect(a.errors, w.slug).toEqual([]);
    expect(a.count, w.slug).toBeGreaterThan(0);
    expect(a.syllables.length, w.slug).toBeGreaterThan(0);
    // Every letter belongs to at least one syllable, in reading order.
    expect([...new Set(a.syllables.flatMap((s) => s.letters))].sort((x, y) => x - y), w.slug).toEqual(a.letters.map((l) => l.index));
    if (a.uncertain.length) flagged.push(w.slug);
  }
  // The flagged words go to the native-speaker review; this keeps the list from growing unnoticed.
  expect(flagged.length / words.length).toBeLessThan(0.1);
});
