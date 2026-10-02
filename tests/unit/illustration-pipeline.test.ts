import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { restyle } from '../../scripts/lib/illustration-pipeline.mjs';

/** A synthetic engraving: 40 hairlines on cream paper, optionally with foxing and a block on the left. */
function plate(S: number, { foxing = false, block = false } = {}) {
  const lines = Array.from({ length: 40 }, (_, i) => `<line x1="${S * 0.2}" y1="${S * (0.2 + i * 0.015)}" x2="${S * 0.8}" y2="${S * (0.25 + i * 0.015)}"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
    <rect width="100%" height="100%" fill="#efe4c8"/>
    ${foxing ? `<circle cx="${S * 0.5}" cy="${S * 0.5}" r="${S * 0.06}" fill="#b07840" opacity=".55"/><circle cx="${S * 0.1}" cy="${S * 0.1}" r="${S * 0.04}" fill="#b07840" opacity=".55"/>` : ''}
    <g stroke="#1a1410" stroke-width="${S / 400}">${lines.join('')}</g>
    ${block ? `<rect x="${S * 0.2}" y="${S * 0.85}" width="${S * 0.05}" height="${S * 0.05}" fill="#1a1410"/>` : ''}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}
const ENTRY = { id: 't', sourceUrl: 'https://commons.wikimedia.org/wiki/File:T.jpg' };
const rgba = (buf: Buffer) => sharp(buf).raw().toBuffer({ resolveWithObject: true });
const alphaSum = (data: Buffer, from = 0, to = Infinity, W = 960) => {
  let s = 0;
  for (let i = 0; i < data.length / 4; i++) {
    const x = i % W;
    if (x >= from && x < to) s += data[i * 4 + 3];
  }
  return s;
};

describe('restyle', { timeout: 30_000 }, () => {
  test('gives three square WebPs, byte-identical on every run', async () => {
    const input = await plate(1400);
    const [a, b] = [await restyle(input, ENTRY), await restyle(input, ENTRY)];
    expect(a.files.map((f) => f.width)).toEqual([320, 640, 960]);
    for (const f of a.files) {
      const m = await sharp(f.buf).metadata();
      expect([m.format, m.width, m.height, m.hasAlpha]).toEqual(['webp', f.width, f.width, true]);
    }
    a.files.forEach((f, i) => expect(f.buf.equals(b.files[i].buf)).toBe(true));
  });

  test('paper is transparent and the ink is tinted aqua', async () => {
    const { files } = await restyle(await plate(1400), ENTRY);
    const { data } = await rgba(files[2].buf);
    expect(data[3]).toBe(0); // the padded corner
    for (const [i, c] of [207, 238, 240].entries()) expect(Math.abs(data[i] - c)).toBeLessThanOrEqual(4);
    expect(Math.max(...Array.from({ length: 960 }, (_, y) => data[(y * 960 + 480) * 4 + 3]))).toBeGreaterThan(200);
  });

  test('ignores brown foxing on the paper', async () => {
    const clean = await restyle(await plate(1400), ENTRY);
    const foxed = await restyle(await plate(1400, { foxing: true }), ENTRY);
    expect(foxed.side).toBe(clean.side);
    const [a, b] = [alphaSum((await rgba(clean.files[2].buf)).data), alphaSum((await rgba(foxed.files[2].buf)).data)];
    expect(Math.abs(b - a) / a).toBeLessThan(0.005);
  });

  test('flip mirrors the art', async () => {
    const input = await plate(1400, { block: true });
    const [plain, flipped] = [await restyle(input, ENTRY), await restyle(input, { ...ENTRY, flip: true })];
    const p = (await rgba(plain.files[2].buf)).data;
    const f = (await rgba(flipped.files[2].buf)).data;
    const [pl, pr, fl, fr] = [alphaSum(p, 0, 480), alphaSum(p, 480), alphaSum(f, 0, 480), alphaSum(f, 480)];
    expect(pl).toBeGreaterThan(pr * 1.05); // the block sits on the left
    expect(fl / pr).toBeCloseTo(1, 2);
    expect(fr / pl).toBeCloseTo(1, 2);
  });

  test('refuses art too small for the 960 px rendition', async () => {
    await expect(restyle(await plate(700), ENTRY)).rejects.toThrow(/needs at least/);
  });

  test('refuses a crop with no ink', async () => {
    await expect(restyle(await plate(1400), { ...ENTRY, crop: [0, 0, 10, 10] })).rejects.toThrow(/no ink found|needs at least/);
  });
});
