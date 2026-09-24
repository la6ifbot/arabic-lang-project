import { FONT_EN, loadCardFonts } from '../lib/fonts';
import type { Word } from '../types';
import { CARD, SIGNATURE_BOX, STORY } from './geometry';
import { layoutStory, type Measure, type StoryLayout } from './layout';
import { imageDescription, imageFileName } from './text';

/**
 * The 9:16 share image, drawn in the browser with the site's own fonts (so Arabic is shaped by a
 * real text engine) in the same look as the static card images: water lit from above, a pearl
 * card with an iridescent rim, and the Durar signature.
 *
 * `renderStory` is the only way to get pixels out of here, and it always ends with
 * `drawSignature`: there is no export without the signature.
 */

const FONT_SIG = '"Aref Ruqaa"';
const { width: W, height: H } = STORY;

let fontsReady: Promise<void> | null = null;
function loadShareFonts() {
  fontsReady ??= Promise.all([
    loadCardFonts(),
    document.fonts.load(`700 60px ${FONT_SIG}`, 'دُرَر'),
    document.fonts.load(`italic 500 30px ${FONT_EN}`, 'durar.space'),
  ])
    .then(() => undefined)
    .catch(() => undefined);
  return fontsReady;
}

type Ctx = CanvasRenderingContext2D;
type Stops = [number, string][];

function setSpacing(ctx: Ctx, px: number) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

const measureWith =
  (ctx: Ctx): Measure =>
  (text, font, rtl, spacing) => {
    ctx.font = font;
    ctx.direction = rtl ? 'rtl' : 'ltr';
    setSpacing(ctx, spacing);
    const w = ctx.measureText(text).width;
    setSpacing(ctx, 0);
    return w;
  };

const addStops = (g: CanvasGradient, stops: Stops) => {
  for (const [at, c] of stops) g.addColorStop(at, c);
  return g;
};

/** CSS `radial-gradient(rx ry at cx cy, …)`: canvas gradients are circles, so scale into an ellipse. */
function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, stops: Stops) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  ctx.fillStyle = addStops(ctx.createRadialGradient(0, 0, 0, 0, 0, 1), stops);
  ctx.fillRect(-cx / rx, -cy / ry, W / rx, H / ry);
  ctx.restore();
}

/** CSS `linear-gradient(<deg>, …)` over the whole image. */
function linear(ctx: Ctx, deg: number, stops: Stops) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
  ctx.fillStyle = addStops(ctx.createLinearGradient(W / 2 - dx * half, H / 2 - dy * half, W / 2 + dx * half, H / 2 + dy * half), stops);
  ctx.fillRect(0, 0, W, H);
}

function cardPath(ctx: Ctx, inset = 0) {
  const x = CARD.x + inset;
  const y = CARD.y + inset;
  const w = CARD.w - inset * 2;
  const h = CARD.h - inset * 2;
  const r = CARD.r - inset;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawWater(ctx: Ctx) {
  ellipse(ctx, W / 2, H * 0.4, W * 1.4, H * 1.1, [
    [0, '#06283a'],
    [0.55, '#031520'],
    [1, '#01080f'],
  ]);
  // Light shafts slanting down from the surface.
  linear(ctx, 104, [
    [0.3, 'rgba(150,230,230,0)'],
    [0.36, 'rgba(150,230,230,0.07)'],
    [0.43, 'rgba(150,230,230,0)'],
  ]);
  linear(ctx, 96, [
    [0.58, 'rgba(150,230,230,0)'],
    [0.63, 'rgba(150,230,230,0.05)'],
    [0.7, 'rgba(150,230,230,0)'],
  ]);
  // The surface glow above.
  ellipse(ctx, W / 2, -H * 0.1, W * 0.95, H * 0.55, [
    [0, 'rgba(64,170,178,0.62)'],
    [0.62, 'rgba(64,170,178,0)'],
  ]);
}

function drawCardBody(ctx: Ctx) {
  ctx.save();
  cardPath(ctx);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 80;
  ctx.shadowOffsetY = 30;
  const body = ctx.createLinearGradient(0, CARD.y, 0, CARD.y + CARD.h);
  ctx.fillStyle = addStops(body, [
    [0, '#123641'],
    [0.78, '#07161e'],
  ]);
  ctx.fill();
  ctx.restore();

  ctx.save();
  cardPath(ctx);
  ctx.clip();
  ellipse(ctx, CARD.x + CARD.w * 0.28, CARD.y + CARD.h * 0.08, CARD.w * 0.8, CARD.h * 0.55, [
    [0, 'rgba(150,200,210,0.22)'],
    [0.7, 'rgba(150,200,210,0)'],
  ]);
  ctx.restore();

  // Nacre rim.
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 3;
  const cx = CARD.x + CARD.w / 2;
  const cy = CARD.y + CARD.h / 2;
  const rim: Stops = ['#f6d8ff', '#c8fff4', '#fff4d8', '#d8e8ff', '#ffd8ec', '#c8fff4', '#f6d8ff'].map((c, i, a) => [i / (a.length - 1), c]);
  // CSS conic angles start at 12 o'clock, canvas ones at 3 o'clock.
  ctx.strokeStyle =
    typeof ctx.createConicGradient === 'function'
      ? addStops(ctx.createConicGradient(((210 - 90) * Math.PI) / 180, cx, cy), rim)
      : addStops(ctx.createLinearGradient(CARD.x, CARD.y, CARD.x + CARD.w, CARD.y + CARD.h), rim);
  cardPath(ctx, 1.5);
  ctx.stroke();
  ctx.restore();
}

function drawText(ctx: Ctx, layout: StoryLayout) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const l of layout.lines) {
    ctx.font = l.font;
    ctx.direction = l.rtl ? 'rtl' : 'ltr';
    ctx.fillStyle = l.color;
    setSpacing(ctx, l.spacing);
    ctx.shadowColor = l.glow ? 'rgba(170,235,240,0.35)' : 'transparent';
    ctx.shadowBlur = l.glow ? 30 : 0;
    ctx.fillText(l.text, l.x, l.y);
  }
  setSpacing(ctx, 0);
  ctx.restore();

  // The ornament under the headword: a hairline with a small pearl.
  const y = layout.rule.y;
  const half = CARD.w * 0.16;
  ctx.save();
  ctx.fillStyle = addStops(ctx.createLinearGradient(W / 2 - half, 0, W / 2 + half, 0), [
    [0, 'rgba(220,240,240,0)'],
    [0.5, 'rgba(220,240,240,0.6)'],
    [1, 'rgba(220,240,240,0)'],
  ]);
  ctx.fillRect(W / 2 - half, y - 1, half * 2, 2);
  ctx.beginPath();
  ctx.arc(W / 2, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = addStops(ctx.createRadialGradient(W / 2 - 2, y - 2.5, 0, W / 2, y, 7), [
    [0, '#ffffff'],
    [0.45, '#dcecee'],
    [1, '#7fa9b1'],
  ]);
  ctx.fill();
  ctx.restore();
}

/**
 * The Durar signature: دُرَر in Aref Ruqaa with durar.space beside it, slanted a little like a
 * signature on a painting. Drawn last, bottom-right on the card, inside Instagram's safe area.
 */
function drawSignature(ctx: Ctx) {
  const right = SIGNATURE_BOX.x + SIGNATURE_BOX.w - 26;
  const base = SIGNATURE_BOX.y + SIGNATURE_BOX.h - 40;
  const ar = `700 64px ${FONT_SIG}`;
  const en = `italic 500 32px ${FONT_EN}`;
  ctx.save();
  ctx.translate(right, base);
  ctx.rotate((-4 * Math.PI) / 180);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right';
  ctx.direction = 'ltr';
  ctx.font = en;
  setSpacing(ctx, 1);
  ctx.fillStyle = 'rgba(240,236,226,0.58)';
  ctx.fillText('durar.space', 0, 0);
  const enWidth = ctx.measureText('durar.space').width;
  setSpacing(ctx, 0);
  ctx.font = ar;
  ctx.direction = 'rtl';
  ctx.fillStyle = 'rgba(240,236,226,0.66)';
  ctx.fillText('دُرَر', -enWidth - 16, 0);
  ctx.restore();
}

/** Draws the story image for a word. Always signed. */
export async function renderStory(word: Word): Promise<HTMLCanvasElement> {
  await loadShareFonts();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const layout = layoutStory(word, measureWith(ctx));
  drawWater(ctx);
  drawCardBody(ctx);
  drawText(ctx, layout);
  drawSignature(ctx);
  return canvas;
}

// ---- PNG with a description --------------------------------------------------------------------

function crc32(bytes: Uint8Array) {
  let crc = ~0;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return ~crc >>> 0;
}

/** Adds an iTXt “Description” chunk (UTF-8, so Arabic survives) right after the PNG header. */
function withDescription(png: Uint8Array, text: string): Uint8Array {
  const enc = new TextEncoder();
  const data = new Uint8Array([...enc.encode('Description'), 0, 0, 0, 0, 0, ...enc.encode(text)]);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(enc.encode('iTXt'), 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  const at = 8 + 25; // signature + IHDR
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at));
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}

/** The signed story image as a PNG file named durar-<slug>.png, described for assistive tech. */
export async function storyFile(word: Word): Promise<File> {
  const canvas = await renderStory(word);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode the image');
  const png = withDescription(new Uint8Array(await blob.arrayBuffer()), imageDescription(word));
  return new File([png as BlobPart], imageFileName(word.slug), { type: 'image/png' });
}
