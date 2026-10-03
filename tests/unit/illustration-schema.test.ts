import { describe, expect, test } from 'vitest';
import illustrations from '../../src/data/illustrations.json';
import topics from '../../src/data/topics.json';
import words from '../../src/data/words.json';
import { DEFAULT_HI, DEFAULT_LO, validateIllustrations } from '../../scripts/lib/illustration-schema.mjs';
import { PIPELINE } from '../../shared/images';

const ROSE = {
  id: 'rose-centifolia',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rosa_centifolia_foliacea.jpg',
  artist: 'Pierre-Joseph Redouté',
  died: 1840,
  work: 'Les Roses',
  plate: 'Rosa centifolia foliacea',
  date: '1817–1824',
  license: 'public-domain',
  alt: 'Engraved cabbage rose in full bloom, with a bud and leaves',
};
const WARD = { slug: 'ward', topics: ['flowers'], image: 'rose-centifolia' };
const check = (entries: Record<string, unknown>[], w: Record<string, unknown>[] = [WARD], t: Record<string, unknown>[] = []) =>
  validateIllustrations(entries, w as never, t as never, { year: 2026 });
const errorsFor = (over: Record<string, unknown>) => check([{ ...ROSE, ...over }]).errors;

describe('illustrations.json validator', () => {
  test('the data in the repo is valid', () => {
    expect(validateIllustrations(illustrations, words, topics).errors).toEqual([]);
  });

  test('a well-formed entry passes', () => expect(check([ROSE])).toEqual({ errors: [], warnings: [] }));

  test.each<[string, Record<string, unknown>, RegExp]>([
    ['an unknown field, with a suggestion', { licence: 'public-domain' }, /unknown field "licence" \(did you mean "license"\?\)/],
    ['a link that is not a Commons file page', { sourceUrl: 'https://example.com/rose.jpg' }, /Wikimedia Commons file page/],
    ['an upload.wikimedia.org link', { sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Rose.jpg' }, /Wikimedia Commons file page/],
    ['a share-alike licence', { license: 'CC-BY-SA-4.0' }, /public-domain or CC0-1\.0 images only/],
    ['a 20th-century date for public domain', { date: '1950' }, /published before 1900/],
    ['an artist who died too recently', { died: 1990 }, /died must be a year ≤ 1955/],
    ['a crop out of range', { crop: [50, 0, 60, 100] }, /crop out of range/],
    ['Arabic script in artist', { artist: 'الواسطي' }, /Latin-script/],
    ['alt starting "Image of"', { alt: 'Image of a rose' }, /without "Image of"/],
    ['alt over 150 characters', { alt: 'A rose '.repeat(25).trim() }, /≤150 characters/],
    ['a hyphen in the date', { date: '1817-1824' }, /en dash/],
    ['an unknown style', { style: 'watercolour' }, /style must be one of/],
    ['lo above hi', { lo: 0.7, hi: 0.5 }, /lo must be below hi/],
    ['hi alone below the default lo', { hi: 0.1 }, /lo must be below hi/],
    ['lo alone above the default hi', { lo: 0.7 }, /lo must be below hi/],
  ])('rejects %s', (_, over, re) => expect(errorsFor(over)).toEqual([expect.stringMatching(re)]));

  test('knows the pipeline’s default thresholds', () => {
    expect([DEFAULT_LO, DEFAULT_HI]).toEqual([PIPELINE.lo, PIPELINE.hi]);
  });

  test('rejects duplicate and unsorted ids', () => {
    const b = { ...ROSE, id: 'aster' };
    expect(check([ROSE, ROSE]).errors).toEqual([expect.stringMatching(/duplicate id/)]);
    expect(check([ROSE, b], [WARD, { ...WARD, slug: 'x', image: 'aster' }]).errors).toEqual([expect.stringMatching(/sorted by id/)]);
  });

  test('a word or topic naming a missing id fails, with a suggestion', () => {
    expect(check([ROSE], [{ ...WARD, image: 'rose-centifola' }]).errors).toEqual([
      expect.stringMatching(/word ward: image "rose-centifola" is not an id .* \(did you mean "rose-centifolia"\?\)/),
    ]);
    expect(check([ROSE], [WARD], [{ id: 'flowers', cover: 'rose' }]).errors).toEqual([expect.stringMatching(/topic flowers: cover "rose"/)]);
  });

  test('warns about an unused entry, an image outside flowers and sky, and a missing death year', () => {
    expect(check([ROSE], []).warnings).toEqual([expect.stringMatching(/not used by any word or topic/)]);
    expect(check([ROSE], [{ ...WARD, topics: ['water'] }]).warnings).toEqual([expect.stringMatching(/neither flowers nor sky/)]);
    expect(check([{ ...ROSE, died: undefined }]).warnings).toEqual([expect.stringMatching(/death year/)]);
  });
});
