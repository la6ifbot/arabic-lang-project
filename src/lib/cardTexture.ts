import type { Word } from '../types';
import { FONT_AR, FONT_EN } from './fonts';

/** Card proportions (width / height). Shared by the 3D mesh, the HTML fallback and exports. */
export const CARD_ASPECT = 0.7;

const INK = '#f4efe3';
const INK_SOFT = 'rgba(214, 232, 236, 0.78)';
const INK_FAINT = 'rgba(196, 222, 228, 0.52)';

interface Line {
  text: string;
  font: string;
  color: string;
  size: number;
  rtl: boolean;
  gapBefore: number;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function layoutBody(
  ctx: CanvasRenderingContext2D,
  word: Word,
  W: number,
  scale: number,
  maxExamples: number,
  exScale = 1,
): Line[] {
  const maxW = W * 0.8;
  const out: Line[] = [];
  const push = (text: string, size: number, font: string, color: string, rtl: boolean, gapBefore: number) => {
    ctx.font = font.replace('{s}', `${size}px`);
    ctx.direction = rtl ? 'rtl' : 'ltr';
    wrap(ctx, text, maxW).forEach((t, i) =>
      out.push({ text: t, font: ctx.font, color, size, rtl, gapBefore: i === 0 ? gapBefore : 0 }),
    );
  };

  const s = (n: number) => Math.round(n * scale * (W / 900));
  const e = (n: number) => Math.round(n * scale * exScale * (W / 900));
  const [primary, ...secondary] = word.meanings;
  push(primary, s(50), `500 {s} ${FONT_EN}`, INK, false, 0);
  if (secondary.length) push(secondary.join('; '), s(36), `italic 500 {s} ${FONT_EN}`, INK_SOFT, false, s(10));

  word.examples.slice(0, maxExamples).forEach((ex, i) => {
    push(ex.ar, e(52), `400 {s} ${FONT_AR}`, INK, true, s(i === 0 ? 70 : 46));
    push(ex.en, e(33), `italic 500 {s} ${FONT_EN}`, INK_SOFT, false, e(12));
    if (ex.source) push(`— ${ex.source}`, s(26), `500 {s} ${FONT_EN}`, INK_FAINT, false, s(4));
  });
  return out;
}

const blockHeight = (lines: Line[]) => lines.reduce((h, l) => h + l.gapBefore + l.size * 1.45, 0);

/**
 * Draws a word card's text (no background — the shader paints the pearl body) onto a canvas.
 * Arabic is shaped by the browser's text engine (connected letterforms, diacritics) with
 * `direction = 'rtl'`, then uploaded as a texture so it takes part in the scene's lighting.
 */
export function drawCard(canvas: HTMLCanvasElement, word: Word) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const u = W / 900;

  // Transliteration, letter-spaced like an engraved label.
  ctx.direction = 'ltr';
  ctx.font = `italic 500 ${Math.round(42 * u)}px ${FONT_EN}`;
  ctx.fillStyle = INK_SOFT;
  ctx.letterSpacing = `${Math.round(3 * u)}px`;
  ctx.fillText(word.translit, W / 2, 150 * u);
  ctx.letterSpacing = '0px';

  // Headword: largest size that fits the card width.
  ctx.direction = 'rtl';
  let size = 250 * u;
  ctx.font = `600 ${size}px ${FONT_AR}`;
  while (ctx.measureText(word.ar).width > W * 0.76 && size > 90 * u) {
    size -= 6 * u;
    ctx.font = `600 ${size}px ${FONT_AR}`;
  }
  const headBase = 150 * u + size * 1.25;
  ctx.shadowColor = 'rgba(170, 235, 240, 0.35)';
  ctx.shadowBlur = 24 * u;
  ctx.fillStyle = INK;
  ctx.fillText(word.ar, W / 2, headBase);
  ctx.shadowBlur = 0;

  // Ornament: a hairline with a small pearl.
  const oy = headBase + 70 * u;
  const grad = ctx.createLinearGradient(W * 0.3, 0, W * 0.7, 0);
  grad.addColorStop(0, 'rgba(220,240,240,0)');
  grad.addColorStop(0.5, 'rgba(220,240,240,0.55)');
  grad.addColorStop(1, 'rgba(220,240,240,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(W * 0.3, oy, W * 0.4, Math.max(1, 2 * u));
  ctx.beginPath();
  ctx.arc(W / 2, oy + u, 7 * u, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(240,250,250,0.85)';
  ctx.fill();

  // Body: meanings + examples, shrunk (then trimmed) until it fits.
  const top = oy + 90 * u;
  const bottom = H - 110 * u;
  let lines: Line[] = [];
  let fit = { scale: 0.72, maxEx: 1 };
  outer: for (let maxEx = 3; maxEx >= 1; maxEx--) {
    for (let scale = 1; scale >= 0.72; scale -= 0.04) {
      lines = layoutBody(ctx, word, W, scale, maxEx);
      fit = { scale, maxEx };
      if (top + blockHeight(lines) <= bottom) break outer;
    }
  }
  // Then let the example sentence and its translation grow into whatever room is left.
  for (let exScale = 1.9; exScale > 1; exScale -= 0.05) {
    const grown = layoutBody(ctx, word, W, fit.scale, fit.maxEx, exScale);
    if (top + blockHeight(grown) <= bottom) {
      lines = grown;
      break;
    }
  }
  let y = top + Math.max(0, (bottom - top - blockHeight(lines)) * 0.28);
  for (const l of lines) {
    y += l.gapBefore + l.size * 1.45;
    ctx.font = l.font;
    ctx.direction = l.rtl ? 'rtl' : 'ltr';
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, W / 2, y - l.size * 0.4);
  }
}

let texHeight = 1280;

/** Sizes card textures to the device: sharp on retina, frugal on phones. */
export function configureTextureSize(cardScreenHeightPx: number, dpr: number) {
  texHeight = Math.round(Math.min(1536, Math.max(960, cardScreenHeightPx * dpr)) / 16) * 16;
}

export const cardTextureHeight = () => texHeight;
