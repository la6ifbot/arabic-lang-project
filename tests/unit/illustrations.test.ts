import { describe, expect, test } from 'vitest';
import { creditLine, IMAGE_LICENSES as SHARED_LICENSES } from '../../shared/credits';
import {
  hash14,
  illustrationKey,
  illustrationKeys,
  illustrationSrcSet,
  illustrationUrl,
  PIPELINE,
  previewUrl,
  recipeHash,
  sourceId,
  type Illustration,
} from '../../shared/images';
import { illustration, illustrationSrc } from '../../src/lib/illustrations';
import { IMAGE_LICENSES, STYLES } from '../../scripts/lib/illustration-schema.mjs';

const ROSE: Illustration = {
  id: 'rose-centifolia',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rosa_centifolia_foliacea.jpg',
  artist: 'Pierre-Joseph Redouté',
  died: 1840,
  work: 'Les Roses',
  plate: 'Rosa centifolia foliacea',
  date: '1817–1824',
  license: 'public-domain',
  alt: 'Engraved cabbage rose in full bloom, with a bud and leaves',
  crop: [12.2, 17.5, 75.6, 74.2],
  style: 'colour',
};

describe('illustration file names', () => {
  test('hash14 is stable across runtimes', () => {
    expect(hash14('')).toBe('0bdcb81aee8d83');
    expect(hash14('a')).toBe('1c2ba782c97901');
  });

  test('are worked out from the entry (update these goldens on purpose when PIPELINE changes)', () => {
    expect(recipeHash(ROSE)).toBe('0946a49af9eded');
    expect(sourceId(ROSE)).toBe('1e3b66e668ca51');
    expect(illustrationUrl(ROSE, 192)).toBe('https://img.durar.space/illustrations/rose-centifolia-0946a49af9eded-320.webp');
    expect(previewUrl(ROSE)).toBe('https://img.durar.space/previews/rose-centifolia-0946a49af9eded.jpg');
  });

  test('cover the whole PIPELINE, so a tint or quality change renames every file', () => {
    const minimal = { id: 'x', sourceUrl: ROSE.sourceUrl } as Illustration;
    expect(recipeHash(minimal)).toBe(hash14(JSON.stringify([PIPELINE, ROSE.sourceUrl, null, 'ink', false, null, null, null])));
  });

  test.each<[string, Partial<Illustration>]>([
    ['sourceUrl', { sourceUrl: 'https://commons.wikimedia.org/wiki/File:Other.jpg' }],
    ['crop', { crop: [12, 17.5, 75.6, 74.2] }],
    ['style', { style: 'ink' }],
    ['flip', { flip: true }],
    ['lo', { lo: 0.2 }],
    ['hi', { hi: 0.5 }],
    ['erase', { erase: [[10, 10, 2]] }],
  ])('change with %s', (_, over) => expect(recipeHash({ ...ROSE, ...over })).not.toBe(recipeHash(ROSE)));

  test.each<[string, Partial<Illustration>]>([
    ['alt', { alt: 'A rose' }],
    ['artist', { artist: 'P.-J. Redouté' }],
    ['died', { died: 1841 }],
    ['work', { work: 'Roses' }],
    ['plate', { plate: undefined }],
    ['date', { date: '1824' }],
    ['license', { license: 'CC0-1.0' }],
    ['scan', { scan: 'Smithsonian Libraries' }],
  ])('stay the same when only %s changes', (_, over) => expect(recipeHash({ ...ROSE, ...over })).toBe(recipeHash(ROSE)));

  test('pick the smallest rendition that covers the request', () => {
    const w = (px?: number) => illustrationUrl(ROSE, px).match(/-(\d+)\.webp$/)![1];
    expect([w(1), w(320), w(321), w(640), w(641), w(5000), w()]).toEqual(['320', '320', '640', '640', '960', '960', '960']);
  });

  test('keys and srcset', () => {
    expect(illustrationKeys(ROSE)).toHaveLength(3);
    for (const k of illustrationKeys(ROSE)) expect(k).toMatch(/^illustrations\/[a-z0-9-]+-[0-9a-f]{14}-(320|640|960)\.webp$/);
    expect(illustrationKey(ROSE, 640)).toBe('illustrations/rose-centifolia-0946a49af9eded-640.webp');
    const set = illustrationSrcSet(ROSE).split(', ');
    expect(set.map((s) => s.split(' ')[1])).toEqual(['320w', '640w', '960w']);
  });
});

describe('browser lookup', () => {
  test('unknown ids give null, never a throw', () => {
    expect(illustration('nope')).toBeNull();
    expect(illustration('constructor')).toBeNull();
    expect(illustration(undefined)).toBeNull();
    expect(illustrationSrc('nope')).toBeNull();
  });

  test('the pilot entry resolves', () => {
    expect(illustration('rose-centifolia')?.artist).toBe('Pierre-Joseph Redouté');
    expect(illustrationSrc('rose-centifolia', 320)).toMatch(/^https:\/\/img\.durar\.space\/illustrations\/rose-centifolia-[0-9a-f]{14}-320\.webp$/);
  });
});

describe('credit lines', () => {
  test('plain, with a plate, and mirrored', () => {
    expect(creditLine(ROSE)).toBe('After Pierre-Joseph Redouté, “Rosa centifolia foliacea”, Les Roses (1817–1824). Public domain. Restyled by Durar.');
    expect(creditLine({ ...ROSE, plate: undefined, license: 'CC0-1.0' })).toBe('After Pierre-Joseph Redouté, Les Roses (1817–1824). CC0 1.0. Restyled by Durar.');
    expect(creditLine({ ...ROSE, flip: true })).toMatch(/\. Mirrored and restyled by Durar\.$/);
  });

  test('the offline validator and the browser agree on licences and styles', () => {
    expect(IMAGE_LICENSES).toEqual([...SHARED_LICENSES]);
    expect(STYLES).toEqual(Object.keys(PIPELINE.styles));
  });
});
