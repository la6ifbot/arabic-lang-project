import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import words from '../src/data/words.json' with { type: 'json' };
import { SIGNATURE_BOX, STORY } from '../src/share/geometry';

export const word = (slug: string) => words.find((w) => w.slug === slug)!;

/** Strips the bidi controls the share text uses, to compare the words themselves. */
export const plain = (s: string) => s.replace(/[‎⁨⁩]/g, '');

/** The canonical word URL, as the build under test writes it. */
export async function canonicalUrl(page: Page, slug: string) {
  const link = page.locator('link[rel=canonical]');
  const href = (await link.count()) ? await link.first().getAttribute('href') : null;
  const origin = href && /^https?:\/\//.test(href) ? new URL(href).origin : 'https://durar.space';
  return `${origin}/word/${slug}`;
}

export async function pngInfo(png: Buffer) {
  const meta = await sharp(png).metadata();
  return { format: meta.format, width: meta.width, height: meta.height };
}

/** The signature's region of a story image. */
export const signatureCrop = (png: Buffer) =>
  sharp(png).extract({ left: SIGNATURE_BOX.x, top: SIGNATURE_BOX.y, width: SIGNATURE_BOX.w, height: SIGNATURE_BOX.h }).png().toBuffer();

/** Pixels clearly lighter than the dark card: the signature's ink. */
export async function inkPixels(png: Buffer) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722 > 90) n++;
  return n;
}

/** Every exported image: a 1080×1920 PNG whose signature region holds the signature. */
export async function expectSigned(png: Buffer) {
  expect(await pngInfo(png)).toEqual({ format: 'png', width: STORY.width, height: STORY.height });
  const crop = await signatureCrop(png);
  expect(await inkPixels(crop)).toBeGreaterThan(600);
  expect(crop).toMatchSnapshot('signature.png', { maxDiffPixelRatio: 0.01 });
}

/** A quarter-size copy for visual snapshots (keeps the committed snapshots small). */
export const thumb = (png: Buffer) => sharp(png).resize(270, 480).png().toBuffer();

/** The Description (iTXt) chunk the image carries for assistive tech. */
export function pngDescription(png: Buffer) {
  let at = 8;
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    if (type === 'iTXt') {
      const data = png.subarray(at + 8, at + 8 + len);
      const key = data.toString('latin1', 0, data.indexOf(0));
      if (key === 'Description') return data.subarray(key.length + 5).toString('utf8');
    }
    at += 12 + len;
  }
  return null;
}
