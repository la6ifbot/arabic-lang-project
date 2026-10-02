// Offline checks for src/data/illustrations.json and the words/topics that use it (npm run validate:data).
// CI later checks the same entries against Commons (scripts/illustrations.mjs); this file needs no network.
export const IMAGE_LICENSES = ['public-domain', 'CC0-1.0'];
export const STYLES = ['ink', 'colour', 'colour-yellow'];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const COMMONS_FILE = /^https:\/\/commons\.wikimedia\.org\/wiki\/File:[^?#\s/]+\.(jpe?g|png|tiff?|gif|webp)$/i;
const DATE = /^(c\. )?\d{3,4}(–\d{3,4})?$/;
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const FIELDS = ['id', 'sourceUrl', 'artist', 'died', 'work', 'plate', 'date', 'license', 'alt', 'scan', 'crop', 'flip', 'style', 'lo', 'hi', 'erase'];
const FLOWERS_AND_SKY = ['flowers', 'sky'];

const text = (v) => typeof v === 'string' && v.trim() !== '' && v.trim() === v;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const near = (s, list) => list.find((x) => lev(s, x) <= 2);
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Returns { errors, warnings }. `year` is injectable for tests. */
export function validateIllustrations(entries, words = [], topics = [], { year = new Date().getFullYear() } = {}) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(entries)) return { errors: ['illustrations.json must be an array'], warnings };
  const ids = [];
  entries.forEach((e, i) => {
    const at = `illustration #${i} (${e?.id ?? '?'})`;
    const err = (m) => errors.push(`${at}: ${m}`);
    for (const k of Object.keys(e)) if (!FIELDS.includes(k)) err(`unknown field "${k}"${near(k, FIELDS) ? ` (did you mean "${near(k, FIELDS)}"?)` : ''}`);
    if (!ID.test(e.id ?? '')) err('id must be lowercase ascii kebab-case, named after what is drawn');
    if (ids.includes(e.id)) err('duplicate id');
    if (i > 0 && typeof e.id === 'string' && e.id < ids[i - 1]) err('entries must be sorted by id');
    ids.push(e.id);
    if (!COMMONS_FILE.test(e.sourceUrl ?? ''))
      err('sourceUrl must be a Wikimedia Commons file page: https://commons.wikimedia.org/wiki/File:<name>.jpg');
    for (const f of ['artist', 'work', 'alt']) if (!text(e[f])) err(`${f} is required`);
    for (const f of ['artist', 'work', 'plate', 'scan'])
      if (e[f] !== undefined && (!text(e[f]) || ARABIC.test(e[f]))) err(`${f} must be non-empty Latin-script text (transliterate Arabic titles)`);
    if (text(e.alt) && (e.alt.length > 150 || /^(image|picture|illustration|photo) of/i.test(e.alt)))
      err('alt: say what is drawn in ≤150 characters, without "Image of"');
    if (!DATE.test(e.date ?? '')) err('date must look like "1817–1824", "1690" or "c. 964" (en dash)');
    if (!IMAGE_LICENSES.includes(e.license))
      err('Durar takes public-domain or CC0-1.0 images only (CC BY-SA would make every card share-alike; NC/ND forbid our use or our restyling). See docs/ILLUSTRATIONS.md');
    if (e.license === 'public-domain') {
      const years = (e.date ?? '').match(/\d{3,4}/g)?.map(Number) ?? [];
      if (years.length && Math.max(...years) > 1899) err('public-domain images must be published before 1900');
      if (e.died !== undefined && !(Number.isInteger(e.died) && e.died <= year - 71)) err(`died must be a year ≤ ${year - 71} (life + 70)`);
      if (e.died === undefined) warnings.push(`${at}: add the artist's death year (died)`);
    }
    if (e.crop !== undefined) {
      const c = e.crop;
      if (!Array.isArray(c) || c.length !== 4 || !c.every(num)) err('crop must be [left, top, width, height] in percent');
      else if (c[0] < 0 || c[1] < 0 || c[2] < 5 || c[3] < 5 || c[0] + c[2] > 100 || c[1] + c[3] > 100)
        err('crop out of range: left, top ≥ 0; width, height ≥ 5; left + width and top + height ≤ 100');
    }
    if (e.flip !== undefined && typeof e.flip !== 'boolean') err('flip must be true or false');
    if (e.style !== undefined && !STYLES.includes(e.style)) err(`style must be one of ${STYLES.join(', ')}`);
    for (const f of ['lo', 'hi']) if (e[f] !== undefined && !(num(e[f]) && e[f] >= 0 && e[f] <= 1)) err(`${f} must be between 0 and 1`);
    if (num(e.lo) && num(e.hi) && e.lo >= e.hi) err('lo must be below hi');
    if (e.erase !== undefined && !(Array.isArray(e.erase) && e.erase.every((c) => Array.isArray(c) && c.length === 3 && c.every(num) && c.every((v) => v >= 0 && v <= 100))))
      err('erase must be a list of [x, y, radius] in percent');
  });

  const used = new Map(ids.map((id) => [id, 0]));
  const ref = (at, id, kind) => {
    if (typeof id !== 'string' || !used.has(id)) {
      const hint = typeof id === 'string' && near(id, ids);
      errors.push(`${at}: ${kind} "${id}" is not an id in src/data/illustrations.json${hint ? ` (did you mean "${hint}"?)` : ''}`);
    } else used.set(id, used.get(id) + 1);
  };
  for (const w of words)
    if (w.image !== undefined) {
      ref(`word ${w.slug}`, w.image, 'image');
      if (!(w.topics ?? []).some((t) => FLOWERS_AND_SKY.includes(t))) warnings.push(`word ${w.slug}: has an image but is in neither flowers nor sky`);
    }
  for (const t of topics) if (t.cover !== undefined) ref(`topic ${t.id}`, t.cover, 'cover');
  for (const [id, n] of used) if (n === 0) warnings.push(`illustration ${id}: not used by any word or topic`);
  return { errors, warnings };
}
