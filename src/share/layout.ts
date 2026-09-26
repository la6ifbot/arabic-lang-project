import { FONT_AR, FONT_EN } from '../lib/fonts';
import type { Word } from '../types';
import { CONTENT, STORY } from './geometry';

/** Width of `text` set in `font` (a canvas font string). The browser passes the canvas' own measure. */
export type Measure = (text: string, font: string, rtl: boolean, spacing: number) => number;

export interface StoryLine {
  text: string;
  font: string;
  color: string;
  rtl: boolean;
  /** Letter spacing in px (the engraved transliteration). */
  spacing: number;
  glow: boolean;
  /** Centre x and alphabetic baseline. */
  x: number;
  y: number;
  /** The line's box, for fit checks: top/bottom of its line height and its measured width. */
  top: number;
  bottom: number;
  width: number;
}

export interface StoryLayout {
  scale: number;
  lines: StoryLine[];
  /** The hairline-and-pearl ornament under the headword. */
  rule: { y: number };
  /** False only if even the smallest scale overflows (never with real words; see the tests). */
  fits: boolean;
}

export const INK = '#f4efe3';
export const INK_SOFT = 'rgba(214, 232, 236, 0.82)';
export const INK_FAINT = 'rgba(196, 222, 228, 0.56)';

interface Block {
  lines: string[];
  font: string;
  size: number;
  lineHeight: number;
  color: string;
  rtl: boolean;
  spacing: number;
  glow: boolean;
  gapBefore: number;
  widths: number[];
}

function greedy(measure: Measure, text: string, font: string, rtl: boolean, maxWidth: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next, font, rtl, 0) > maxWidth) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** Wraps to the fewest lines, then evens them out so no word is left alone on the last line. */
function wrap(measure: Measure, text: string, font: string, rtl: boolean, maxWidth: number): string[] {
  const lines = greedy(measure, text, font, rtl, maxWidth);
  if (lines.length < 2) return lines;
  let lo = maxWidth / 2;
  let hi = maxWidth;
  let best = lines;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    const tryLines = greedy(measure, text, font, rtl, mid);
    if (tryLines.length <= lines.length && tryLines.every((l) => measure(l, font, rtl, 0) <= mid || !l.includes(' '))) {
      best = tryLines;
      hi = mid;
    } else lo = mid;
  }
  return best;
}

const RULE_SPACE = (s: number) => ({ before: 14 * s, after: 44 * s });

function blocks(word: Word, measure: Measure, s: number): Block[] {
  const out: Block[] = [];
  const add = (
    text: string,
    size: number,
    weight: string,
    family: string,
    color: string,
    o: { rtl?: boolean; lineHeight?: number; gap?: number; spacing?: number; glow?: boolean; nowrap?: boolean; maxWidth?: number } = {},
  ) => {
    const font = `${weight} ${Math.round(size)}px ${family}`;
    const rtl = !!o.rtl;
    const spacing = o.spacing ?? 0;
    const lines = o.nowrap ? [text] : wrap(measure, text, font, rtl, o.maxWidth ?? CONTENT.maxWidth);
    out.push({
      lines,
      font,
      size: Math.round(size),
      lineHeight: Math.round(size) * (o.lineHeight ?? 1.25),
      color,
      rtl,
      spacing,
      glow: !!o.glow,
      gapBefore: o.gap ?? 0,
      widths: lines.map((l) => measure(l, font, rtl, spacing)),
    });
  };

  add(word.translit, 50 * s, 'italic 500', FONT_EN, INK_SOFT, { spacing: Math.round(3 * s), nowrap: true, lineHeight: 1.2 });

  // Headword: as large as fits one line; a long phrase shrinks, then (only if it must) wraps.
  const headFont = (n: number) => `600 ${Math.round(n)}px ${FONT_AR}`;
  let head = 236 * s;
  const w = measure(word.ar, headFont(head), true, 0);
  if (w > CONTENT.headWidth) head = Math.max(118 * s, (head * CONTENT.headWidth) / w);
  add(word.ar, head, '600', FONT_AR, INK, { rtl: true, lineHeight: 1.55, gap: 6 * s, glow: true, maxWidth: CONTENT.headWidth });

  const [primary, ...more] = word.meanings;
  add(primary, 62 * s, '500', FONT_EN, INK, { lineHeight: 1.2, gap: RULE_SPACE(s).before + RULE_SPACE(s).after });
  if (more.length) add(more.join('; '), 46 * s, 'italic 500', FONT_EN, INK_SOFT, { lineHeight: 1.22, gap: 10 * s });

  const ex = word.examples[0];
  if (ex) {
    add(ex.ar, 60 * s, '400', FONT_AR, INK, { rtl: true, lineHeight: 1.5, gap: 70 * s });
    add(ex.en, 44 * s, 'italic 500', FONT_EN, INK_SOFT, { lineHeight: 1.25, gap: 12 * s });
    if (ex.source) add(`— ${ex.source}`, 34 * s, '500', FONT_EN, INK_FAINT, { lineHeight: 1.25, gap: 8 * s });
  }
  return out;
}

const height = (bs: Block[]) => bs.reduce((h, b) => h + b.gapBefore + b.lines.length * b.lineHeight, 0);
const tooWide = (bs: Block[]) =>
  bs.some((b, i) => b.widths.some((w) => w > (i === 1 ? CONTENT.headWidth : CONTENT.maxWidth) + 0.5));

/**
 * Lays out a word on the story card: the largest scale at which everything fits between the top
 * of the card and the signature, without clipping or overflowing the card's width.
 */
export function layoutStory(word: Word, measure: Measure): StoryLayout {
  const room = CONTENT.bottom - CONTENT.top;
  let s = 1;
  let bs = blocks(word, measure, s);
  while ((height(bs) > room || tooWide(bs)) && s > 0.3) {
    s = Math.round((s - 0.025) * 1000) / 1000;
    bs = blocks(word, measure, s);
  }
  const fits = height(bs) <= room && !tooWide(bs);

  // A little above centre reads as balanced on a tall card.
  let y = CONTENT.top + Math.max(0, room - height(bs)) * 0.42;
  const lines: StoryLine[] = [];
  let ruleY = 0;
  bs.forEach((b, i) => {
    y += b.gapBefore;
    if (i === 2) ruleY = y - RULE_SPACE(s).after;
    b.lines.forEach((text, j) => {
      const top = y;
      y += b.lineHeight;
      lines.push({
        text,
        font: b.font,
        color: b.color,
        rtl: b.rtl,
        spacing: b.spacing,
        glow: b.glow,
        x: STORY.width / 2,
        // Baseline: the middle of the line box, dropped by about a third of the type size.
        y: Math.round(top + b.lineHeight / 2 + b.size * 0.3),
        top,
        bottom: y,
        width: b.widths[j],
      });
    });
  });
  return { scale: s, lines, rule: { y: Math.round(ruleY) }, fits };
}
