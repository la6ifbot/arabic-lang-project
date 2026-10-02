// scripts/illustrations.mjs against a fake Commons, a fake img.durar.space and a fake S3 bucket.
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import registry from '../../src/data/illustrations.json';
import { creditLine } from '../../shared/credits';
import { illustrationKeys, recipeHash, sourceId, type Illustration } from '../../shared/images';
import { licenseProblem, main, renderEntry } from '../../scripts/illustrations.mjs';
import { IMMUTABLE, putOnce, type PutInput, type UploadClient } from '../../scripts/lib/image-host.mjs';

const HOST = 'https://img.durar.space/';
const REAL = registry as Illustration[];
const ENTRY: Illustration = {
  id: 'test-rose',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Test_rose.jpg',
  artist: 'Pierre-Joseph Redouté',
  died: 1840,
  work: 'Les Roses',
  date: '1817–1824',
  license: 'public-domain',
  alt: 'A rose',
};

let bytes: Buffer;
let store: Map<string, PutInput>;
let commons: { calls: number; license: string; missing: boolean; sha1?: string };
let cors: boolean;

const client: UploadClient = {
  async send(input) {
    if (input.IfNoneMatch === '*' && store.has(input.Key))
      throw Object.assign(new Error('PreconditionFailed'), { $metadata: { httpStatusCode: 412 } });
    store.set(input.Key, input);
  },
};

async function fakeFetch(url: string | URL, init: RequestInit = {}) {
  const u = String(url);
  const resp = (status: number, body: BodyInit | null = null, headers: Record<string, string> = {}) => new Response(body, { status, headers });
  if (u.startsWith(HOST)) {
    const hit = store.get(u.slice(HOST.length));
    if (!hit) return resp(403);
    return resp(200, init.method === 'HEAD' ? null : (hit.Body as BodyInit), cors ? { 'access-control-allow-origin': '*' } : {});
  }
  if (u.startsWith('https://commons.wikimedia.org/w/api.php')) {
    commons.calls++;
    const ua = (init.headers as Record<string, string>)?.['User-Agent'] ?? '';
    if (!ua.startsWith('Durar-illustrations/')) return resp(403);
    const q = new URL(u).searchParams;
    if (q.get('list') === 'search') return resp(200, JSON.stringify({ query: { search: [{ title: 'File:Rosa centifolia foliacea.jpg' }] } }));
    if (commons.missing) return resp(200, JSON.stringify({ query: { pages: [{ title: q.get('titles'), missing: true }] } }));
    const sha1 = commons.sha1 ?? createHash('sha1').update(bytes).digest('hex');
    const pd = commons.license === 'pd';
    const extmetadata = {
      License: { value: commons.license },
      LicenseShortName: { value: pd ? 'Public domain' : 'CC BY-SA 4.0' },
      Artist: { value: '<a href="https://example.org">Pierre-Joseph Redouté</a>' },
      DateTimeOriginal: { value: '1817' },
    };
    const info = { url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/R.jpg', sha1, size: bytes.length, width: 1400, height: 1400, mime: 'image/jpeg', extmetadata };
    return resp(200, JSON.stringify({ query: { pages: [{ title: q.get('titles'), imageinfo: [info] }] } }));
  }
  if (u.startsWith('https://upload.wikimedia.org/')) return resp(200, new Uint8Array(bytes));
  throw new Error(`unexpected fetch ${u}`);
}

beforeAll(async () => {
  const S = 1400;
  const lines = Array.from({ length: 40 }, (_, i) => `<line x1="${S * 0.2}" y1="${S * (0.2 + i * 0.015)}" x2="${S * 0.8}" y2="${S * (0.25 + i * 0.015)}"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="100%" height="100%" fill="#efe4c8"/><g stroke="#8a1030" stroke-width="${S / 400}">${lines.join('')}</g></svg>`;
  bytes = await sharp(Buffer.from(svg)).jpeg().toBuffer();
  vi.stubGlobal('fetch', fakeFetch);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  store = new Map();
  commons = { calls: 0, license: 'pd', missing: false };
  cors = true;
});

describe('rendering an entry', { timeout: 60_000 }, () => {
  test('the first time, checks Commons once, archives the source, and uploads write-once', async () => {
    const { archived, meta } = await renderEntry(ENTRY, client);
    expect([archived, commons.calls]).toEqual([false, 1]);
    const id = sourceId(ENTRY);
    expect([...store.keys()].sort()).toEqual(
      [`sources/${id}.jpg`, `sources/${id}.json`, ...illustrationKeys(ENTRY), `previews/test-rose-${recipeHash(ENTRY)}.jpg`].sort(),
    );
    for (const k of illustrationKeys(ENTRY)) expect(store.get(k)).toMatchObject({ ContentType: 'image/webp', CacheControl: IMMUTABLE, IfNoneMatch: '*' });
    expect(JSON.parse(store.get(`sources/${id}.json`)!.Body as string)).toMatchObject({ sha256: meta.sha256, license: 'pd', artist: 'Pierre-Joseph Redouté' });
  });

  test('a changed recipe re-renders from the archive without asking Commons', async () => {
    await renderEntry(ENTRY, client);
    const { archived } = await renderEntry({ ...ENTRY, crop: [5, 5, 90, 90] }, client);
    expect([archived, commons.calls]).toEqual([true, 1]);
  });

  test('never overwrites a file that exists', async () => {
    expect(await putOnce(client, 'x', 'a', 'text/plain')).toBe('uploaded');
    expect(await putOnce(client, 'x', 'b', 'text/plain')).toBe('exists');
    expect(store.get('x')!.Body).toBe('a');
  });

  test('refuses a source whose Commons licence differs', async () => {
    commons.license = 'cc-by-sa-4.0';
    await expect(renderEntry(ENTRY, client)).rejects.toThrow(/Commons says the licence is "CC BY-SA 4.0", not public-domain/);
    expect(store.size).toBe(0);
    expect(licenseProblem({ license: 'CC0-1.0' }, { license: 'pd', licenseShortName: 'Public domain' })).toMatch(/not CC0-1.0/);
    expect(licenseProblem({ license: 'public-domain' }, { license: '', licenseShortName: 'Public domain' })).toBeNull();
  });

  test('a misspelt file name lists the closest match', async () => {
    commons.missing = true;
    await expect(renderEntry(ENTRY, client)).rejects.toThrow(
      /no such file on Commons: "File:Test rose\.jpg".*Closest: https:\/\/commons\.wikimedia\.org\/wiki\/File:Rosa_centifolia_foliacea\.jpg/,
    );
  });

  test('a download that does not match Commons’ SHA-1 fails', async () => {
    commons.sha1 = '0'.repeat(40);
    await expect(renderEntry(ENTRY, client)).rejects.toThrow(/SHA-1 differs/);
    expect(store.size).toBe(0);
  });
});

describe('the CI commands', { timeout: 60_000 }, () => {
  test('--upload renders what is missing and reports it; --check then passes, and fails without CORS', async () => {
    const base = join(mkdtempSync(join(tmpdir(), 'durar-')), 'base.json');
    writeFileSync(base, '[]');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['--upload', `--base=${base}`], { client });
    for (const e of REAL) for (const k of illustrationKeys(e)) expect(store.has(k)).toBe(true);
    const md = readFileSync(join(__dirname, '../../.illustrations/report.md'), 'utf8');
    expect(md.startsWith('<!-- durar:illustrations -->')).toBe(true);
    for (const e of REAL) expect(md).toContain(creditLine(e));

    const calls = commons.calls;
    await main(['--upload'], { client });
    expect(commons.calls).toBe(calls);

    await main(['--check']);
    cors = false;
    await expect(main(['--check'])).rejects.toThrow(/Access-Control-Allow-Origin/);
  });
});
