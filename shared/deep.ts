/**
 * The Deep: the rules shared by the site, the in-browser mock and the tests. The database applies
 * the same rules for real (supabase/migrations/20261013000000_the_deep.sql); the site only uses
 * these to answer instantly and to explain a name that won't be accepted.
 */
import { BOX_DAYS, DAY_MS, MAX_BOX, review, type Box, type Direction, type Progress } from './mastery.js';

// ---------------------------------------------------------------------------------------------
// Reviews and verified depth

export interface Verified {
  /** The box the server has seen earned: 0 until then. Only this counts on The Deep. */
  verifiedBox: 0 | Box;
  /** ISO time the verified box last moved. */
  verifiedAt: string | null;
}

export type ServerRow = Progress & Verified;

/**
 * record_review(): one swipe judged on the server's clock. A known word moves only when it's due;
 * a merged (unverified) word starts its verified ladder again at box 2.
 */
export function applyReview(prev: ServerRow | undefined, slug: string, dir: Direction, now: number): { row: ServerRow; moved: boolean } {
  const at = new Date(now).toISOString();
  if (!prev) {
    const p = review(slug, undefined, dir, now);
    return { row: { ...p, verifiedBox: p.box, verifiedAt: at }, moved: true };
  }
  if (dir === 'known' && Date.parse(prev.dueAt) > now) return { row: prev, moved: false };
  const p = review(slug, prev, dir, now);
  if (dir === 'learning') return { row: { ...p, verifiedBox: 1, verifiedAt: at }, moved: true };
  let verifiedBox = prev.verifiedBox;
  let verifiedAt = prev.verifiedAt;
  if (prev.verifiedBox === 0) {
    verifiedBox = 2;
    verifiedAt = at;
  } else if (!prev.verifiedAt || Date.parse(prev.verifiedAt) + BOX_DAYS[prev.verifiedBox] * DAY_MS <= now) {
    verifiedBox = Math.min(prev.verifiedBox + 1, MAX_BOX) as Box;
    verifiedAt = at;
  }
  return { row: { ...p, verifiedBox, verifiedAt }, moved: true };
}

/** save_progress(): the sign-in merge. The latest review wins; a merge never raises verified depth. */
export function applyMerge(prev: ServerRow | undefined, incoming: Progress): ServerRow {
  if (!prev) return { ...incoming, verifiedBox: 0, verifiedAt: null };
  if (Date.parse(incoming.lastReviewedAt) < Date.parse(prev.lastReviewedAt)) return prev;
  return {
    ...incoming,
    timesSeen: Math.max(prev.timesSeen, incoming.timesSeen),
    lapses: Math.max(prev.lapses, incoming.lapses),
    verifiedBox: Math.min(prev.verifiedBox, incoming.box) as 0 | Box,
    verifiedAt: prev.verifiedAt,
  };
}

/** Depth (every verified box added up) and pearls in the deep (verified box 2 or more). */
export function deepScore(rows: Iterable<Pick<Verified, 'verifiedBox'>>): { depth: number; pearls: number } {
  let depth = 0;
  let pearls = 0;
  for (const r of rows) {
    depth += r.verifiedBox;
    if (r.verifiedBox >= 2) pearls++;
  }
  return { depth, pearls };
}

// ---------------------------------------------------------------------------------------------
// The week: Monday 00:00 in Amsterdam, summer or winter.

const amsterdamParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Amsterdam',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
});
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The Amsterdam date (YYYY-MM-DD) of the Monday that starts the week containing `now`. */
export function weekStart(now: number): string {
  const parts = Object.fromEntries(amsterdamParts.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  const day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return new Date(day - WEEKDAYS.indexOf(parts.weekday) * DAY_MS).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Names. The server also checks reserved names and a word list in both languages, and that the
// name is free; the site checks the shape as you type.

export type NameProblem = 'length' | 'characters' | 'mixed' | 'reserved' | 'not_allowed' | 'taken';

export const NAME_MIN = 3;
export const NAME_MAX = 20;

const LATIN = 'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u017F';
const ARABIC_LETTERS = '\\u0621-\\u063A\\u0641-\\u064A\\u067E\\u0686\\u0698\\u06A9\\u06AF\\u06CC';
const ARABIC_MARKS = '\\u064B-\\u0652\\u0670';
const ALLOWED = new RegExp(`^[${LATIN}${ARABIC_LETTERS}${ARABIC_MARKS}0-9\\u0660-\\u0669 ._-]+$`);
const HAS_LETTER = new RegExp(`[${LATIN}${ARABIC_LETTERS}]`);
const HAS_LATIN = new RegExp(`[${LATIN}]`);
const HAS_ARABIC = new RegExp(`[${ARABIC_LETTERS}]`);
const BAD_SEPARATORS = /^[ ._-]|[ ._-]$|[ ._-]{2}/;
const STRAY_MARK = new RegExp(`(^|[^${ARABIC_LETTERS}${ARABIC_MARKS}])[${ARABIC_MARKS}]`);
const GENERATED = /^(diver|غواص) ?[0-9]+$/;

/** Trimmed, NFC, single spaces: the name as it will be shown. */
export function cleanName(name: string): string {
  return name.trim().normalize('NFC').replace(/\s+/g, ' ');
}

/** Case, Arabic marks and letter variants, digits and separators folded (deep_name_key()). */
export function nameKey(name: string): string {
  const from = 'أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
  const to = 'ااااهيوي01234567890123456789';
  return [...cleanName(name).toLowerCase().replace(/[ً-ْٰـ]/g, '')]
    .map((c) => {
      const i = from.indexOf(c);
      return i < 0 ? c : to[i];
    })
    .join('')
    .replace(/[ ._-]+/g, ' ')
    .trim();
}

/** The shape rules (deep_name_problem()'s first checks); null when the shape is fine. */
export function nameShapeProblem(name: string): NameProblem | null {
  const n = cleanName(name);
  const len = [...n].length;
  if (len < NAME_MIN || len > NAME_MAX) return 'length';
  if (!ALLOWED.test(n) || !HAS_LETTER.test(n) || BAD_SEPARATORS.test(n) || STRAY_MARK.test(n)) return 'characters';
  if (HAS_LATIN.test(n) && HAS_ARABIC.test(n)) return 'mixed';
  if (GENERATED.test(nameKey(n))) return 'reserved';
  return null;
}

/** “Diver 142” or «غوّاص ١٤٢». */
export function generatedName(n: number, script: 'latin' | 'arabic'): string {
  return script === 'arabic' ? `غوّاص ${String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])}` : `Diver ${n}`;
}
