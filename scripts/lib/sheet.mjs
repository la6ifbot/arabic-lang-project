// The Google Sheet <-> data files mapping (Phase 0.6, section G). Used by scripts/import-sheet.mjs
// (published CSV -> src/data/*.json) and scripts/export-sheet.mjs (src/data/*.json -> CSV, to fill
// the Sheet). Column layout and editing rules: docs/CONTENT.md.

/** Words tab columns, in Sheet order. `notes` is for the reviewers and never reaches the site. */
export const WORD_COLUMNS = [
  'slug',
  'ar',
  'translit',
  'meaning_1',
  'meaning_2',
  'meaning_3',
  'root',
  'topics',
  'added',
  'status',
  'example_1_ar',
  'example_1_en',
  'example_1_source',
  'example_2_ar',
  'example_2_en',
  'example_2_source',
  'example_3_ar',
  'example_3_en',
  'example_3_source',
  'etymology',
  'etymology_source',
  'image',
  'notes',
];
export const TOPIC_COLUMNS = ['id', 'order', 'name_en', 'name_ar', 'description_en', 'description_ar', 'cover'];
const MEANINGS = 3;
const EXAMPLES = 3;
/** Review states (section G). A blank cell, or no `status` in words.json, means draft. */
export const STATUSES = ['draft', 'reviewed'];

/** RFC 4180 CSV (what Google Sheets publishes): quoted fields, doubled quotes, newlines in cells. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field), rows.push(row), (row = []), (field = '');
    } else field += c;
  }
  if (field !== '' || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const csvField = (v) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
export const toCsv = (rows) => rows.map((r) => r.map((v) => csvField(String(v ?? ''))).join(',')).join('\r\n') + '\r\n';

/** Header row + data rows -> objects keyed by column. Reports missing and unknown columns. */
function tableToRecords(rows, columns, required, tab) {
  const errors = [];
  const warnings = [];
  if (rows.length === 0) return { records: [], errors: [`${tab} tab is empty`], warnings };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  for (const col of required) if (!header.includes(col)) errors.push(`${tab} tab: missing column "${col}"`);
  for (const h of header) if (h && !columns.includes(h)) warnings.push(`${tab} tab: column "${h}" is not used`);
  const records = rows.slice(1).map((r, i) => {
    const rec = { _row: i + 2 };
    header.forEach((h, j) => {
      if (columns.includes(h)) rec[h] = (r[j] ?? '').trim();
    });
    return rec;
  });
  return { records, errors, warnings };
}

const list = (cell) =>
  (cell ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Words tab rows -> word objects, in the key order words.json uses. Fields the Sheet has no column
 * for (e.g. `audio`) are carried over from the current word with the same slug.
 */
export function rowsToWords(rows, current = []) {
  const required = ['slug', 'ar', 'translit', 'meaning_1', 'topics', 'example_1_ar', 'example_1_en'];
  const { records, errors, warnings } = tableToRecords(rows, WORD_COLUMNS, required, 'words');
  if (errors.length) return { words: [], errors, warnings };
  const bySlug = new Map(current.map((w) => [w.slug, w]));
  const known = new Set(['slug', 'ar', 'translit', 'meanings', 'root', 'topics', 'added', 'examples', 'etymology', 'image', 'status']);
  const words = records.map((r) => {
    const at = `words row ${r._row} (${r.slug || '?'})`;
    const w = { slug: r.slug, ar: r.ar, translit: r.translit };
    w.meanings = Array.from({ length: MEANINGS }, (_, i) => r[`meaning_${i + 1}`]).filter(Boolean);
    if (r.root) w.root = r.root;
    w.topics = list(r.topics);
    // A new row with no date joins today; the validator rejects anything that is not a date.
    w.added = r.added || todayInAmsterdam();
    w.examples = [];
    for (let i = 1; i <= EXAMPLES; i++) {
      const ar = r[`example_${i}_ar`];
      const en = r[`example_${i}_en`];
      const source = r[`example_${i}_source`];
      if (ar || en || source) w.examples.push({ ar: ar ?? '', en: en ?? '', ...(source ? { source } : {}) });
    }
    if (r.etymology || r.etymology_source) w.etymology = { text: r.etymology ?? '', source: r.etymology_source ?? '' };
    if (r.image) w.image = r.image;
    const status = (r.status ?? '').toLowerCase();
    if (status && !STATUSES.includes(status)) errors.push(`${at}: status must be blank, draft or reviewed`);
    if (status === 'reviewed') w.status = 'reviewed';
    const old = bySlug.get(w.slug);
    if (!old) return w;
    for (const [k, v] of Object.entries(old)) if (!known.has(k)) w[k] = v;
    // Keep the word's existing key order, so an unchanged row writes an unchanged line.
    const ordered = {};
    for (const k of Object.keys(old)) if (k in w) ordered[k] = w[k];
    return Object.assign(ordered, w);
  });
  return { words, errors, warnings };
}

/** Topics tab rows -> topic objects, in the key order topics.json uses. */
export function rowsToTopics(rows) {
  const { records, errors, warnings } = tableToRecords(rows, TOPIC_COLUMNS, TOPIC_COLUMNS.slice(0, 6), 'topics');
  const topics = records.map((r) => {
    const t = { id: r.id, order: /^-?\d+$/.test(r.order ?? '') ? Number(r.order) : r.order };
    t.name = { en: r.name_en, ar: r.name_ar };
    t.description = { en: r.description_en, ar: r.description_ar };
    if (r.cover) t.cover = r.cover;
    return t;
  });
  return { topics, errors, warnings };
}

/** words.json -> Words tab rows (header first). Absent status exports as "draft". */
export function wordsToRows(words) {
  const rows = words.map((w) => {
    const r = {
      slug: w.slug,
      ar: w.ar,
      translit: w.translit,
      root: w.root,
      topics: w.topics.join(', '),
      added: w.added,
      status: w.status ?? 'draft',
      etymology: w.etymology?.text,
      etymology_source: w.etymology?.source,
      image: typeof w.image === 'string' ? w.image : undefined,
    };
    w.meanings.forEach((m, i) => (r[`meaning_${i + 1}`] = m));
    w.examples.forEach((e, i) => {
      r[`example_${i + 1}_ar`] = e.ar;
      r[`example_${i + 1}_en`] = e.en;
      r[`example_${i + 1}_source`] = e.source;
    });
    return WORD_COLUMNS.map((c) => r[c] ?? '');
  });
  return [WORD_COLUMNS, ...rows];
}

export function topicsToRows(topics) {
  return [
    TOPIC_COLUMNS,
    ...topics.map((t) => [t.id, t.order, t.name.en, t.name.ar, t.description.en, t.description.ar, t.cover ?? '']),
  ];
}

/** What changed between two lists keyed by `key`: new, changed (with the fields) and removed. */
export function diffById(before, after, key = 'slug') {
  const old = new Map(before.map((x) => [x[key], x]));
  const next = new Map(after.map((x) => [x[key], x]));
  const added = after.filter((x) => !old.has(x[key]));
  const removed = before.filter((x) => !next.has(x[key]));
  const changed = [];
  for (const x of after) {
    const o = old.get(x[key]);
    if (!o) continue;
    const fields = [...new Set([...Object.keys(o), ...Object.keys(x)])].filter(
      (k) => JSON.stringify(o[k]) !== JSON.stringify(x[k]),
    );
    if (fields.length) changed.push({ id: x[key], fields });
  }
  const moved = before.filter((x) => next.has(x[key])).map((x) => x[key]).join() !==
    after.filter((x) => old.has(x[key])).map((x) => x[key]).join();
  return { added, changed, removed, reordered: moved };
}

export function todayInAmsterdam(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', dateStyle: 'short' }).format(at);
}
