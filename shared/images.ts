// Illustrations (decision 5): restyled public-domain plates on img.durar.space.
// Browser-safe and data-free: no node imports, no JSON imports. Callers pass a registry entry.
// The file name of every rendition is worked out from the entry alone (no stored hash, no network),
// so the browser, the prerender, the CI script and the tests all agree without a manifest.
import { IMAGE_ORIGIN } from './site.js';

/**
 * Everything that shapes the pixels. The key hash covers JSON.stringify(PIPELINE), so changing any value
 * (tint, widths, quality, thresholds) renames and re-renders every illustration from the source archive.
 * Bump `version` when the processing code in scripts/lib/illustration-pipeline.mjs changes behaviour.
 */
export const PIPELINE = {
  version: 1,
  widths: [320, 640, 960], // square WebPs; all three always exist
  workMax: 1920, // long side of the working image after the crop (never enlarged)
  maxUpscale: 1.25, // the 960 output may enlarge the art at most this much; smaller art fails CI
  bg: { blocks: 180, percentile: 0.9, close: 2, sigma: 1 }, // local paper estimate
  gate: [0.5, 0.7], // ink style: neutrality smoothstep, drops foxing, stains and colour washes
  lo: 0.18,
  hi: 0.6,
  gamma: 0.8, // darkness -> alpha ramp
  styles: {
    ink: { mode: 'ink' }, // black-ink line/stipple engravings and woodcuts, incl. hand-coloured ones
    colour: { mode: 'colour', channel: 'green', detail: 0.8 }, // colour-printed red/pink/purple plates (Redouté)
    'colour-yellow': { mode: 'colour', channel: 'blue', detail: 0.8 }, // colour-printed yellow flowers
  },
  detailSigma: 1 / 600,
  pad: 0.04,
  trimMass: 0.001,
  lift: { 320: 0.7, 640: 0.85, 960: 0.9 },
  kernel: 'lanczos3',
  tint: [207, 238, 240], // #cfeef0, baked in; consumers dim with opacity, never re-tint
  webp: { quality: 80, alphaQuality: 70, effort: 6 },
} as const;

export type IllustrationWidth = (typeof PIPELINE.widths)[number];
export const ILLUSTRATION_WIDTHS: readonly IllustrationWidth[] = PIPELINE.widths;
export type IllustrationStyle = keyof typeof PIPELINE.styles;

/** Opacity when drawing an illustration: behind text keeps pearl text >= 4.5:1 anywhere on the card. */
export const ILLUSTRATION_ALPHA = { behindText: 0.18, panel: 0.9 } as const;

export type ImageLicense = 'public-domain' | 'CC0-1.0';

/** One entry of src/data/illustrations.json (authored by hand or by the sheet import). */
export interface Illustration {
  id: string;
  sourceUrl: string; // https://commons.wikimedia.org/wiki/File:<Title>
  artist: string;
  died?: number;
  work: string;
  plate?: string;
  date: string;
  license: ImageLicense;
  alt: string;
  scan?: string;
  crop?: [number, number, number, number]; // percent of the source: left, top, width, height
  flip?: boolean;
  style?: IllustrationStyle;
  lo?: number;
  hi?: number;
  erase?: [number, number, number][]; // percent: x (of width), y (of height), r (of width)
}

/** cyrb53: tiny synchronous 53-bit hash, identical in browsers, Node and tests. Not for security. */
export function hash14(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Archive id of a source file: depends on the Commons page URL only. */
export const sourceId = (e: Pick<Illustration, 'sourceUrl'>) => hash14(e.sourceUrl);

const hashes = new Map<Illustration, string>();
/** Hash of everything that changes pixels. Provenance (artist, alt, licence…) never renames a file. */
export function recipeHash(e: Illustration): string {
  let h = hashes.get(e);
  if (!h) {
    h = hash14(
      JSON.stringify([
        PIPELINE,
        e.sourceUrl,
        e.crop ?? null,
        e.style ?? 'ink',
        e.flip ?? false,
        e.lo ?? null,
        e.hi ?? null,
        e.erase ?? null,
      ]),
    );
    hashes.set(e, h);
  }
  return h;
}

export const illustrationKey = (e: Illustration, w: IllustrationWidth) => `illustrations/${e.id}-${recipeHash(e)}-${w}.webp`;
export const illustrationKeys = (e: Illustration) => ILLUSTRATION_WIDTHS.map((w) => illustrationKey(e, w));

/** Smallest rendition >= `px` device pixels (else the largest). Never throws. */
export function illustrationUrl(e: Illustration, px = 960): string {
  const w = ILLUSTRATION_WIDTHS.find((x) => x >= px) ?? ILLUSTRATION_WIDTHS[ILLUSTRATION_WIDTHS.length - 1];
  return `${IMAGE_ORIGIN}/${illustrationKey(e, w)}`;
}

export const illustrationSrcSet = (e: Illustration) =>
  ILLUSTRATION_WIDTHS.map((w) => `${IMAGE_ORIGIN}/${illustrationKey(e, w)} ${w}w`).join(', ');

/** Contact sheet CI uploads for review (source + 10% grid + crop, result on the sea, faint on a card). */
export const previewUrl = (e: Illustration) => `${IMAGE_ORIGIN}/previews/${e.id}-${recipeHash(e)}.jpg`;
