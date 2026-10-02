// Illustrations (decision 5): public-domain plates from Wikimedia Commons, restyled into Durar line art
// and served from img.durar.space under names worked out from src/data/illustrations.json alone.
//   • `npm run illustrations -- --upload` (CI): for every entry whose files are missing on the host, take the
//     source from the archive on img.durar.space (or, the first time, from Commons after checking its
//     licence), render, upload write-once, upload a review sheet, and write .illustrations/report.md.
//   • `npm run illustrations -- --check` (CI): every rendition of every entry is on the host, with CORS.
//   • `npm run illustrations [-- --only=a,b]` (anyone with network): render into .illustrations/ to look at.
//   • `--base=<file>`: the base branch's illustrations.json; the report lists entries added or changed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGE_ORIGIN } from '../shared/site.ts';
import { ILLUSTRATION_ALPHA, illustrationKey, illustrationKeys, previewUrl, recipeHash, sourceId } from '../shared/images.ts';
import { creditLine } from '../shared/credits.ts';
import { validateIllustrations } from './lib/illustration-schema.mjs';
import { checkOnHost, headOnHost, putOnce, s3 } from './lib/image-host.mjs';
import { contactSheet, restyle } from './lib/illustration-pipeline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.illustrations');
const UA = 'Durar-illustrations/1.0 (https://durar.space; hello@durar.space)';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const MAX_ORIGINAL = 50e6; // bigger originals (TIFF masters) are fetched as Commons' 3840 px JPEG rendition
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/tiff': 'tif', 'image/gif': 'gif', 'image/webp': 'webp' };
const COMMONS_LICENSE = { 'public-domain': ['pd'], 'CC0-1.0': ['cc0'] };

const sha = (alg, buf) => createHash(alg).update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with the Wikimedia User-Agent, a timeout and 3 attempts on 429/5xx (honours Retry-After, ≤ 60 s). */
export async function politeFetch(url, { timeout = 120_000, attempts = 3 } = {}) {
  for (let i = 1; ; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
    if (r.ok || i >= attempts || !(r.status === 429 || r.status >= 500)) return r;
    await sleep(Math.min(60, Number(r.headers.get('retry-after')) || 5 * i) * 1000);
  }
}

const titleOf = (sourceUrl) => decodeURIComponent(new URL(sourceUrl).pathname.slice('/wiki/'.length)).replace(/_/g, ' ');

/** Commons imageinfo for a File page, or an error that names the closest titles. */
export async function commonsInfo(sourceUrl) {
  const title = titleOf(sourceUrl);
  const q = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: title,
    prop: 'imageinfo', iiprop: 'url|sha1|size|mime|extmetadata', iiurlwidth: '3840',
    iiextmetadatafilter: 'License|LicenseShortName|Artist|DateTimeOriginal',
  });
  const r = await politeFetch(`${COMMONS_API}?${q}`, { timeout: 30_000 });
  if (!r.ok) throw new Error(`Commons API answered ${r.status}`);
  const page = (await r.json()).query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing || !info) {
    const s = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', list: 'search', srnamespace: '6', srlimit: '3', srsearch: title.replace(/^File:/, '').replace(/\.\w+$/, '') });
    const hits = (await (await politeFetch(`${COMMONS_API}?${s}`, { timeout: 30_000 })).json()).query?.search ?? [];
    throw new Error(`no such file on Commons: "${title}". Check the exact name, extension and capitals.${hits.length ? ` Closest: ${hits.map((h) => `https://commons.wikimedia.org/wiki/${h.title.replace(/ /g, '_')}`).join(' , ')}` : ''}`);
  }
  const meta = (k) => info.extmetadata?.[k]?.value?.replace(/<[^>]+>/g, '').trim() ?? '';
  return { title: page.title, info, license: meta('License').toLowerCase(), licenseShortName: meta('LicenseShortName'), artist: meta('Artist'), date: meta('DateTimeOriginal') };
}

/** Commons' licence must match what the entry declares; anything with SA/NC/ND fails. */
export function licenseProblem(entry, c) {
  const ok = COMMONS_LICENSE[entry.license]?.includes(c.license) ||
    (entry.license === 'public-domain' && /^public domain$/i.test(c.licenseShortName)) ||
    (entry.license === 'CC0-1.0' && /^cc0/i.test(c.licenseShortName));
  return ok ? null : `Commons says the licence is "${c.licenseShortName || c.license || 'unknown'}", not ${entry.license}. Pick another copy of the plate whose Commons page says public domain or CC0.`;
}

/**
 * The source bytes. From the archive on img.durar.space when it has them (the archive is the pinned input:
 * later changes on Commons never alter Durar's images); otherwise from Commons, archived write-once.
 */
export async function loadSource(entry, client) {
  const id = sourceId(entry);
  const side = await fetch(`${IMAGE_ORIGIN}/sources/${id}.json`);
  if (side.ok) {
    const meta = await side.json();
    const r = await fetch(`${IMAGE_ORIGIN}/${meta.key}`);
    if (!r.ok) throw new Error(`archive: ${meta.key} answered ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (sha('sha256', bytes) !== meta.sha256) throw new Error(`archive: ${meta.key} does not match its sha256`);
    return { bytes, meta, archived: true };
  }
  if (side.status !== 403 && side.status !== 404) throw new Error(`archive: sources/${id}.json answered ${side.status}`);
  const c = await commonsInfo(entry.sourceUrl);
  const problem = licenseProblem(entry, c);
  if (problem) throw new Error(problem);
  const { info } = c;
  const original = info.size <= MAX_ORIGINAL && info.mime !== 'image/tiff';
  const url = original ? info.url : info.thumburl;
  if (!url) throw new Error(`Commons gave no usable rendition (${info.mime}, ${Math.round(info.size / 1e6)} MB)`);
  const r = await politeFetch(url);
  if (!r.ok) throw new Error(`download ${url} answered ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (original && sha('sha1', bytes) !== info.sha1) throw new Error(`download ${url}: SHA-1 differs from Commons (truncated?)`);
  const mime = original ? info.mime : 'image/jpeg';
  const meta = {
    sourceUrl: entry.sourceUrl, title: c.title, url, original, key: `sources/${id}.${EXT[mime] ?? 'bin'}`,
    bytes: bytes.length, sha256: sha('sha256', bytes), commonsSha1: info.sha1, width: info.width, height: info.height, mime,
    license: c.license, licenseShortName: c.licenseShortName, artist: c.artist, date: c.date,
    fetchedAt: new Date().toISOString(), run: `${process.env.GITHUB_RUN_ID ?? 'local'}@${process.env.GITHUB_SHA ?? ''}`,
  };
  if (client) {
    await putOnce(client, meta.key, bytes, mime);
    await putOnce(client, `sources/${id}.json`, JSON.stringify(meta, null, 2), 'application/json'); // last: marks the archive complete
  }
  return { bytes, meta, archived: false };
}

/** Render one entry; upload its renditions and review sheet when `client` is given. */
export async function renderEntry(entry, client) {
  const { bytes, meta, archived } = await loadSource(entry, client);
  const r = await restyle(bytes, entry);
  mkdirSync(OUT, { recursive: true });
  const sheet = await contactSheet(bytes, entry, r, ILLUSTRATION_ALPHA.behindText);
  writeFileSync(join(OUT, `${entry.id}-sheet.jpg`), sheet);
  for (const f of r.files) {
    writeFileSync(join(OUT, `${entry.id}-${f.width}.webp`), f.buf);
    if (client) await putOnce(client, illustrationKey(entry, f.width), f.buf, 'image/webp');
  }
  if (client) await putOnce(client, `previews/${entry.id}-${recipeHash(entry)}.jpg`, sheet, 'image/jpeg');
  return { r, meta, archived };
}

const fmtCrop = (e, r) => (e.crop ? `${e.crop.join(' ')} % → ${r.cropPx.join(' ')} px` : 'whole plate');

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

/** Markdown for the sticky PR comment and the job log. */
export function report(rows) {
  const lines = [
    '<!-- durar:illustrations -->',
    '### Illustrations in this pull request',
    '',
    '| | id | Credit (as published) | Commons says | Used by |',
    '|---|---|---|---|---|',
  ];
  for (const { e, meta, error, usedBy, notes } of rows) {
    const thumb = error ? 'failed' : `<img width="120" src="${IMAGE_ORIGIN}/${illustrationKey(e, 320)}">`;
    const commons = meta ? `${meta.licenseShortName || meta.license} · ${meta.artist || '?'} · ${meta.date || '?'}` : '';
    const id = error ? `**${e.id}**: ${error}` : `${e.id} ([review sheet](${previewUrl(e)}))${notes.length ? `<br>${notes.join('; ')}` : ''}`;
    lines.push(`| ${thumb} | ${cell(id)} | ${cell(creditLine(e))} | ${cell(commons)} | ${usedBy.join(', ') || '(unused)'} |`);
  }
  lines.push('', 'Images appear on the Vercel preview (reload it) at /credits and on each word once this check is green.');
  return lines.join('\n');
}

/** `deps.client` lets tests inject a fake S3 client. */
export async function main(argv, deps = {}) {
  const flag = (n) => argv.includes(`--${n}`);
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const read = (f) => JSON.parse(readFileSync(join(ROOT, 'src/data', f), 'utf8'));
  const entries = read('illustrations.json');
  const words = read('words.json');
  const topics = read('topics.json');
  const v = validateIllustrations(entries, words, topics);
  if (v.errors.length) throw new Error(v.errors.join('\n'));
  const only = opt('only')?.split(',');
  const selected = only ? entries.filter((e) => only.includes(e.id)) : entries;

  if (flag('check')) {
    const { missing, noCors } = await checkOnHost(selected.flatMap(illustrationKeys));
    if (noCors.length) throw new Error(`img.durar.space sends no Access-Control-Allow-Origin for ${noCors[0]}: add the CORS response headers policy to CloudFront`);
    if (missing.length) throw new Error(`missing on ${IMAGE_ORIGIN}:\n${missing.join('\n')}`);
    console.log(`illustrations: all ${selected.length} on ${IMAGE_ORIGIN}.`);
    return;
  }

  const upload = flag('upload');
  const client = upload ? (deps.client ?? (await s3())) : null;
  const base = opt('base') && existsSync(opt('base')) ? JSON.parse(readFileSync(opt('base'), 'utf8')) : null;
  const before = new Map((base ?? []).map((e) => [e.id, JSON.stringify(e)]));
  const changed = (e) => before.get(e.id) !== JSON.stringify(e);
  const usedBy = (e) => [...words.filter((w) => w.image === e.id).map((w) => w.slug), ...topics.filter((t) => t.cover === e.id).map((t) => `cover of ${t.id}`)];

  let todo = selected;
  if (upload) {
    const { missing } = await headOnHost(selected.flatMap(illustrationKeys));
    todo = selected.filter((e) => illustrationKeys(e).some((k) => missing.includes(k)));
    console.log(`illustrations: ${todo.length} of ${selected.length} to render.`);
  }
  const rows = [];
  const errors = [];
  for (const e of todo) { // strictly sequential: one Commons request at a time
    try {
      const { r, meta, archived } = await renderEntry(e, client);
      const notes = [...r.warnings, `source ${r.source.join('×')} px, crop ${fmtCrop(e, r)}`, archived ? 'from archive' : 'fetched from Commons and archived'];
      console.log(`✓ ${e.id}: ${notes.join('; ')}`);
      rows.push({ e, meta, usedBy: usedBy(e), notes });
    } catch (err) {
      errors.push(`✗ ${e.id}: ${err.message}`);
      rows.push({ e, error: err.message, usedBy: usedBy(e), notes: [] });
    }
  }
  // Entries changed in this PR whose files already existed still get a row (credit text may have changed).
  // The declared licence is re-checked against what Commons said when the source was archived.
  for (const e of selected) {
    if (!base || !changed(e) || todo.includes(e)) continue;
    const side = await fetch(`${IMAGE_ORIGIN}/sources/${sourceId(e)}.json`);
    const meta = side.ok ? await side.json() : null;
    const problem = meta && licenseProblem(e, meta);
    if (problem) errors.push(`✗ ${e.id}: ${problem}`);
    rows.push({ e, meta, error: problem ?? undefined, usedBy: usedBy(e), notes: ['files already on the host'] });
  }
  const shown = base ? rows.filter((x) => changed(x.e) || x.error) : rows;
  if (shown.length) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'report.md'), report(shown));
    console.log(report(shown));
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`illustrations: ${e.message}`);
    process.exit(1);
  });
}
