/**
 * The anatomy of a word (Phase 0.7, section G): a vowelled headword broken into its written
 * letters, which of them join the next one, and its syllables with their sounds.
 *
 * One module for the site (the unthread layer, loaded lazily), the validator and the tests, so
 * they can never disagree. The letter names and sound hints live in src/data/letters.json, where
 * the native-speaker review can reach them.
 *
 * Counting rules (decision 19): written letters. لا is two (lām + alif). A doubled letter
 * (shadda) counts once and is marked `doubled`. ة and ى are letters. Spaces separate words.
 */
import LETTER_TABLE from '../src/data/letters.json' with { type: 'json' };

export type Joins = 'both' | 'back' | 'none';
export type Form = 'alone' | 'start' | 'middle' | 'end';

export interface LetterInfo {
  char: string;
  name: { ar: string; tr: string };
  /** The letter's sound in Durar's transliteration (ʾ for every hamzah). */
  tr: string;
  /** An approximate sound for English speakers. */
  sound: string;
  /** `back`: joins the letter before it but never the next one. `none`: joins nothing (ء). */
  joins: Joins;
  note?: string;
  hamzah?: boolean;
  /** Only ever written at the end of a word (ة, ى). */
  final?: boolean;
}

export const LETTERS: readonly LetterInfo[] = LETTER_TABLE as LetterInfo[];
export const LETTER_INFO: ReadonlyMap<string, LetterInfo> = new Map(LETTERS.map((l) => [l.char, l]));

export interface Letter {
  /** Position among the headword's letters (spaces not counted). */
  index: number;
  /** Which word of the headword it belongs to (most headwords have one). */
  word: number;
  base: string;
  /** Its vowel marks, in the order written. */
  marks: string;
  info: LetterInfo;
  joinsPrev: boolean;
  joinsNext: boolean;
  /** The shape it has inside the word. */
  form: Form;
  /** Written with shadda: one letter, said twice. */
  doubled: boolean;
}

export interface Syllable {
  /** The syllable as written: its letters with their marks (a doubled letter split across two). */
  ar: string;
  /** Its sound, in Durar's transliteration. */
  tr: string;
  /** Indexes into `letters`. A doubled letter can belong to two syllables. */
  letters: number[];
  word: number;
}

/** An override for the automatic syllables (`syllables` in words.json): beads, in reading order. */
export interface SyllableOverride {
  ar: string;
  tr: string;
}

export interface Anatomy {
  ar: string;
  letters: Letter[];
  count: number;
  words: number;
  syllables: Syllable[];
  /** `override`: taken from the word's `syllables` field. */
  syllableSource: 'auto' | 'override';
  /** Why the automatic syllables may be wrong; such words go into the native-speaker review. */
  uncertain: string[];
  /** Data problems: an unknown character, a mark with no letter, an override that doesn't fit. */
  errors: string[];
}

export const ZWJ = '‍';
const FATHA = 'َ';
const DAMMA = 'ُ';
const KASRA = 'ِ';
const SHADDA = 'ّ';
const SUKUN = 'ْ';
const DAGGER_ALIF = 'ٰ';
/** Tanwin, short vowels, shadda, sukun, maddah, hamzah above/below, dagger alif. */
const MARK = /[ً-ٰٕ]/;
const TATWEEL = 'ـ';
/** Letters a preceding al- assimilates into (the “sun letters”). */
const SUN = new Set([...'تثدذرزسشصضطظلن']);

const joinsForward = (info: LetterInfo) => info.joins === 'both';
const joinsBackward = (info: LetterInfo) => info.joins !== 'none';

/** The four shapes of a letter, drawn with zero-width joiners. `null`: the letter never takes it. */
export function shapes(info: LetterInfo): Record<Form, string | null> {
  const c = info.char;
  // ء never changes shape. A letter that never joins the next one starts a word as it stands alone,
  // and sits mid-word as it ends one.
  if (info.joins === 'none') return { alone: c, start: c, middle: c, end: c };
  const end = ZWJ + c;
  if (info.final) return { alone: c, start: null, middle: null, end };
  if (info.joins === 'back') return { alone: c, start: c, middle: end, end };
  return { alone: c, start: c + ZWJ, middle: ZWJ + c + ZWJ, end };
}

/** The letter with its marks, in the shape it has inside the word. */
export function positional(l: Pick<Letter, 'base' | 'marks' | 'joinsPrev' | 'joinsNext'>): string {
  return (l.joinsPrev ? ZWJ : '') + l.base + l.marks + (l.joinsNext ? ZWJ : '');
}

/** Headword → letters with their marks, joins and shapes. */
export function segment(ar: string): { letters: Letter[]; words: number; errors: string[] } {
  const letters: Letter[] = [];
  const errors: string[] = [];
  let word = 0;
  let gap = false;
  for (const ch of ar.normalize('NFC').trim()) {
    if (/\s/.test(ch)) {
      gap = true;
      continue;
    }
    if (ch === TATWEEL || ch === ZWJ) continue;
    if (MARK.test(ch)) {
      const last = letters.at(-1);
      if (!last || gap) errors.push(`a vowel mark (U+${ch.codePointAt(0)!.toString(16).toUpperCase()}) with no letter`);
      else last.marks += ch;
      continue;
    }
    const info = LETTER_INFO.get(ch);
    if (!info) {
      errors.push(`“${ch}” (U+${ch.codePointAt(0)!.toString(16).toUpperCase()}) is not in the letter table`);
      continue;
    }
    if (gap && letters.length) word++;
    gap = false;
    letters.push({ index: letters.length, word, base: ch, marks: '', info, joinsPrev: false, joinsNext: false, form: 'alone', doubled: false });
  }
  for (const [i, l] of letters.entries()) {
    const next = letters[i + 1];
    l.doubled = l.marks.includes(SHADDA);
    l.joinsNext = !!next && next.word === l.word && joinsForward(l.info) && joinsBackward(next.info);
    if (next) next.joinsPrev = l.joinsNext;
  }
  for (const l of letters) l.form = l.joinsPrev ? (l.joinsNext ? 'middle' : 'end') : l.joinsNext ? 'start' : 'alone';
  return { letters, words: letters.length ? word + 1 : 0, errors };
}

// ---- Syllables -------------------------------------------------------------------------------

interface Unit {
  k: 'C' | 'V';
  tr: string;
  at: number;
}

const AL = 'has al-, “the”';
const LONG: Record<string, string> = { a: 'ā', i: 'ī', u: 'ū' };

function vowelOf(marks: string): string | null {
  if (marks.includes(FATHA)) return 'a';
  if (marks.includes(DAMMA)) return 'u';
  if (marks.includes(KASRA)) return 'i';
  return null;
}

function tanwinOf(marks: string): string | null {
  if (marks.includes('ً')) return 'a';
  if (marks.includes('ٌ')) return 'u';
  if (marks.includes('ٍ')) return 'i';
  return null;
}

/** One word's letters → consonant and vowel sounds, in pause (no case endings beyond what's written). */
function sounds(ws: Letter[], flag: (why: string) => void, phraseEnd: boolean): Unit[] {
  const out: Unit[] = [];
  const article = ws.length > 2 && ws[0].base === 'ا' && !ws[0].marks && ws[1].base === 'ل';
  for (const [j, l] of ws.entries()) {
    const next = ws[j + 1];
    const last = j === ws.length - 1;
    const prevUnit = out.at(-1);
    const v = vowelOf(l.marks);
    const tan = tanwinOf(l.marks);
    const sukun = l.marks.includes(SUKUN);
    const bare = !v && !tan && !sukun && !l.doubled && !l.marks.includes(DAGGER_ALIF);
    const nextBare = !!next && !vowelOf(next.marks) && !tanwinOf(next.marks) && !next.marks.includes(SUKUN);

    if (article && j === 0) {
      // al-: the alif is only a way into the word.
      out.push({ k: 'V', tr: 'a', at: l.index });
      flag(AL);
      continue;
    }
    if (article && j === 1) {
      // Before a sun letter the lām is silent and the letter after it is doubled instead.
      if (!(next && SUN.has(next.base) && next.doubled)) out.push({ k: 'C', tr: 'l', at: l.index });
      continue;
    }
    if (l.base === 'ا' || l.base === 'ى') {
      if (j > 0 && tanwinOf(ws[j - 1].marks) === 'a') continue; // the alif after -an is silent (or read ā, below)
      if (bare && prevUnit?.k === 'V' && prevUnit.tr === 'a') {
        prevUnit.tr = 'ā';
        continue;
      }
      if (bare && prevUnit?.k === 'C') {
        out.push({ k: 'V', tr: 'ā', at: l.index });
        continue;
      }
      if (j === 0 && v) {
        out.push({ k: 'C', tr: 'ʾ', at: l.index }, { k: 'V', tr: v, at: l.index });
        flag('a vowel on a bare alif');
        continue;
      }
      out.push({ k: 'V', tr: 'ā', at: l.index });
      flag(`an alif that is not a long ā`);
      continue;
    }
    if ((l.base === 'و' || l.base === 'ي') && bare && j > 0) {
      const long = l.base === 'و' ? 'u' : 'i';
      if (prevUnit?.k === 'V' && prevUnit.tr === long) {
        prevUnit.tr = LONG[long];
        continue;
      }
      if (prevUnit?.k === 'C' && !ws[j - 1].marks.includes(SUKUN)) {
        out.push({ k: 'V', tr: LONG[long], at: l.index });
        continue;
      }
      if (!last) flag(`an unmarked ${l.info.name.tr}`);
    }
    // The -iyy ending (hindiyy, badawiyy) is said -ī at the end.
    if (l.base === 'ي' && l.doubled && last && !v && !tan && prevUnit?.k === 'V' && prevUnit.tr === 'i') {
      prevUnit.tr = 'ī';
      continue;
    }
    // tāʾ marbūṭah: -ah at the end of the headword, -at when another word follows (surrat al-faras).
    if (l.base === 'ة' && last && phraseEnd) {
      if (prevUnit?.k === 'C') out.push({ k: 'V', tr: 'a', at: l.index });
      out.push({ k: 'C', tr: 'h', at: l.index });
      continue;
    }
    if (l.base === 'آ') {
      out.push({ k: 'C', tr: 'ʾ', at: l.index }, { k: 'V', tr: 'ā', at: l.index });
      continue;
    }

    const tr = l.base === 'ة' ? 't' : l.info.tr;
    out.push({ k: 'C', tr, at: l.index });
    if (l.doubled) out.push({ k: 'C', tr, at: l.index });
    if (v) out.push({ k: 'V', tr: v, at: l.index });
    else if (tan === 'a' && last === false && next && (next.base === 'ا' || next.base === 'ى') && j + 1 === ws.length - 1) {
      // -an before a final alif is said -ā at the end of a word (riḍā, nadā).
      out.push({ k: 'V', tr: 'ā', at: l.index });
    } else if (tan) {
      out.push({ k: 'V', tr: tan, at: l.index }, { k: 'C', tr: 'n', at: l.index });
      flag('tanwīn');
    } else if (l.marks.includes(DAGGER_ALIF)) out.push({ k: 'V', tr: 'ā', at: l.index });
    else if (l.base === 'إ') out.push({ k: 'V', tr: 'i', at: l.index });
    else if (!sukun && !last) {
      // Fatha is often left unwritten before a long ā; anything else unmarked is a guess.
      const before = next && (next.base === 'ا' || next.base === 'ى') && nextBare;
      if (!before) flag(`no vowel on ${l.info.name.tr}`);
    }
  }
  return out;
}

/** Splits sounds into syllables: each one starts at the consonant before its vowel. */
function group(units: Unit[]): Unit[][] {
  const out: Unit[][] = [];
  let cur: Unit[] = [];
  units.forEach((u, i) => {
    const startsSyllable = u.k === 'C' && units[i + 1]?.k === 'V';
    if (startsSyllable && cur.some((x) => x.k === 'V')) {
      out.push(cur);
      cur = [];
    }
    cur.push(u);
  });
  if (cur.length) {
    if (cur.some((x) => x.k === 'V') || !out.length) out.push(cur);
    else out[out.length - 1].push(...cur);
  }
  return out;
}

/** The syllable as written: a doubled letter shows sukun in the first syllable and its vowel in the second. */
function writeSyllable(idx: number[], letters: Letter[], owners: Map<number, number[]>, at: number): string {
  return idx
    .map((i) => {
      const l = letters[i];
      const shared = (owners.get(i) ?? []).length > 1;
      if (!shared) return l.base + l.marks;
      const first = owners.get(i)![0] === at;
      return l.base + (first ? SUKUN : l.marks.replace(SHADDA, ''));
    })
    .join('');
}

function finish(groups: { tr: string; letters: number[]; word: number }[], letters: Letter[]): Syllable[] {
  const owners = new Map<number, number[]>();
  groups.forEach((g, gi) => g.letters.forEach((i) => owners.set(i, [...(owners.get(i) ?? []), gi])));
  return groups.map((g, gi) => ({ ...g, ar: writeSyllable(g.letters, letters, owners, gi) }));
}

function autoSyllables(letters: Letter[], words: number, flag: (why: string) => void) {
  const groups: { tr: string; letters: number[]; word: number }[] = [];
  for (let w = 0; w < words; w++) {
    const ws = letters.filter((l) => l.word === w);
    const sylls = group(sounds(ws, flag, w === words - 1));
    const owner = new Map<number, number>();
    const first = groups.length;
    sylls.forEach((s, si) => {
      const idx = [...new Set(s.map((u) => u.at))];
      let tr = s.map((u) => u.tr).join('');
      if (si === 0) tr = tr.replace(/^ʾ/, ''); // a word's opening hamzah isn't written in transliteration
      groups.push({ tr, letters: idx, word: w });
      for (const i of idx) if (!owner.has(i)) owner.set(i, first + si);
    });
    // Silent letters (a long vowel's alif, al-'s assimilated lām, the alif after -an) go with
    // the syllable before them.
    let lastOwner = first;
    for (const l of ws) {
      if (owner.has(l.index)) {
        lastOwner = Math.max(...groups.map((g, gi) => (g.letters.includes(l.index) ? gi : -1)));
        continue;
      }
      const g = groups[lastOwner];
      if (!g) continue;
      g.letters.push(l.index);
      g.letters.sort((a, b) => a - b);
    }
  }
  return finish(groups, letters);
}

const stripMarks = (s: string) => [...s.normalize('NFC')].filter((c) => !MARK.test(c) && !/\s/.test(c) && c !== TATWEEL);

function overrideSyllables(letters: Letter[], beads: SyllableOverride[], errors: string[]): Syllable[] {
  const groups: { tr: string; letters: number[]; word: number }[] = [];
  let p = 0;
  for (const b of beads) {
    const idx: number[] = [];
    for (const [k, c] of stripMarks(b.ar).entries()) {
      const prev = letters[p - 1];
      // A doubled letter may open the next bead too (dur · rah).
      if (k === 0 && prev?.doubled && prev.base === c && groups.at(-1)?.letters.at(-1) === p - 1) idx.push(p - 1);
      else if (letters[p]?.base === c) idx.push(p++);
      else {
        errors.push(`syllables: “${b.ar}” doesn't match the headword's letters`);
        return [];
      }
    }
    if (!idx.length || !b.tr?.trim()) {
      errors.push('syllables: every bead needs Arabic letters and a transliteration');
      return [];
    }
    groups.push({ tr: b.tr.trim(), letters: idx, word: letters[idx[0]].word });
  }
  if (p !== letters.length) {
    errors.push('syllables: the beads leave out some of the headword’s letters');
    return [];
  }
  return finish(groups, letters);
}

/** Durar's transliteration of the whole headword, as the syllables spell it. */
export const spelled = (syllables: Syllable[]) => syllables.map((s) => s.tr).join('');

const squash = (s: string) => s.normalize('NFC').toLowerCase().replace(/[\s-]/g, '');

/** Everything the anatomy layer shows for a word, plus what the validator reports. */
export function anatomy(word: { ar: string; translit?: string; syllables?: SyllableOverride[] }): Anatomy {
  const { letters, words, errors } = segment(word.ar);
  const uncertain = new Set<string>();
  let syllables: Syllable[];
  let syllableSource: Anatomy['syllableSource'] = 'auto';
  if (word.syllables?.length) {
    syllableSource = 'override';
    syllables = overrideSyllables(letters, word.syllables, errors);
  } else {
    syllables = autoSyllables(letters, words, (why) => uncertain.add(why));
    // Durar's transliteration keeps al- unassimilated (al dabarān), so those words are already flagged.
    if (word.translit && !uncertain.has(AL) && squash(spelled(syllables)) !== squash(word.translit))
      uncertain.add(`the syllables spell “${syllables.map((s) => s.tr).join('·')}”, the card says “${word.translit}”`);
  }
  return { ar: word.ar, letters, count: letters.length, words, syllables, syllableSource, uncertain: [...uncertain], errors };
}

// ---- Words for people ------------------------------------------------------------------------

const list = (items: string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export const countLabel = (n: number) => `${n} letter${n === 1 ? '' : 's'}`;

/** One sentence about the thread: where it breaks between letters of the same word. */
export function joinSentence(a: Anatomy): string {
  const pairs = a.letters.filter((l, i) => a.letters[i + 1]?.word === l.word);
  if (!pairs.length) return '';
  const breaks = pairs.filter((l) => !l.joinsNext);
  if (!breaks.length) return 'Every letter joins the next.';
  if (breaks.length === pairs.length) return `None of them join${pairs.length === 1 ? 's' : ''} the next letter.`;
  const names = [...new Set(breaks.map((l) => l.info.name.tr))];
  return `The thread breaks after ${list(names)}, which never join${names.length === 1 ? 's' : ''} the next letter.`;
}

/** The screen-reader description, e.g. “دُرَر, 3 letters: dāl, rāʾ, rāʾ. None of them join the next letter. Syllables: du · rar.” */
export function describe(a: Anatomy): string {
  const names = a.letters.map((l) => l.info.name.tr + (l.doubled ? ' (doubled)' : '')).join(', ');
  const joins = joinSentence(a);
  return `${a.ar}, ${countLabel(a.count)}: ${names}.${joins ? ` ${joins}` : ''} Syllables: ${a.syllables.map((s) => s.tr).join(' · ')}.`;
}
