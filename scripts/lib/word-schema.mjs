// Durar's content rules for src/data/words.json and src/data/topics.json. Used by
// `npm run validate:data` (CI) and, later, the Google Sheet import script.

const ARABIC = /[؀-ۿ]/;
/** Short vowels, tanwin, shadda and sukun. */
const HARAKAT = /[ً-ْ]/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Transliteration: lowercase Latin words separated by single spaces, long vowels with a macron
 * (ā ī ū), emphatics with a dot below (ḥ ṣ ḍ ṭ ẓ), ʿayn as ʿ (U+02BF) and hamza as ʾ (U+02BE).
 */
const TRANSLIT = /^[a-zāīūḥṣḍṭẓʿʾ]+( [a-zāīūḥṣḍṭẓʿʾ]+)*$/;
const TOPIC_ID = /^[a-z]+(-[a-z]+)*$/;
const HTTPS = /^https:\/\/\S+$/;
/** An image is a key on the image host (e.g. "illustrations/ward.webp") or a full https URL. */
const IMAGE_SRC = /^(https:\/\/\S+|[a-z0-9][a-z0-9._/-]*\.(webp|avif|png|jpe?g|svg))$/;

/** Pearl of the Day's first day: no word can have joined before it. */
export const FIRST_ADDED = '2026-09-24';
/** The topic whose words must carry a sourced etymology (decision 8). */
export const BORROWED_TOPIC = 'borrowed';
/** Each launch topic should reach this many words; fewer is a warning, not an error. */
export const TOPIC_TARGET = 20;

const text = (v) => typeof v === 'string' && v.trim() !== '' && v.trim() === v;
const bilingual = (v) => v && typeof v === 'object' && text(v.en) && text(v.ar) && ARABIC.test(v.ar);

/** Returns { errors, warnings } for the topic registry. */
export function validateTopics(topics) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(topics) || topics.length === 0) return { errors: ['topics.json must be a non-empty array'], warnings };
  const ids = new Set();
  const orders = new Set();
  topics.forEach((t, i) => {
    const at = `topic #${i} (${t?.id ?? '?'})`;
    if (!TOPIC_ID.test(t.id ?? '')) errors.push(`${at}: id must be lowercase ascii kebab-case`);
    if (ids.has(t.id)) errors.push(`${at}: duplicate id`);
    ids.add(t.id);
    if (!bilingual(t.name)) errors.push(`${at}: name needs en and ar (Arabic script)`);
    if (!bilingual(t.description)) errors.push(`${at}: description needs en and ar (Arabic script)`);
    if (!Number.isInteger(t.order)) errors.push(`${at}: order must be an integer`);
    else if (orders.has(t.order)) errors.push(`${at}: duplicate order ${t.order}`);
    orders.add(t.order);
    if (t.cover !== undefined && !IMAGE_SRC.test(t.cover)) errors.push(`${at}: cover must be an image key or https URL`);
  });
  return { errors, warnings };
}

/** Returns { errors, warnings } for the word list, checked against the topic registry. */
export function validateWords(words, topics = []) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(words)) return { errors: ['words.json must be an array'], warnings };
  const topicIds = new Set(topics.map((t) => t.id));
  const slugs = new Set();
  const perTopic = new Map([...topicIds].map((id) => [id, 0]));

  words.forEach((w, i) => {
    const at = `#${i} (${w?.slug ?? '?'})`;
    const err = (m) => errors.push(`${at}: ${m}`);

    if (!SLUG.test(w.slug ?? '')) err('slug must be lowercase ascii kebab-case');
    if (slugs.has(w.slug)) err('duplicate slug');
    slugs.add(w.slug);

    if (!ARABIC.test(w.ar ?? '')) err('ar must contain Arabic');
    else if (!HARAKAT.test(w.ar)) err('ar (the headword) needs its diacritics');

    if (!text(w.translit)) err('missing translit');
    else if (w.translit !== w.translit.normalize('NFC') || !TRANSLIT.test(w.translit))
      err(
        `translit "${w.translit}" must be lowercase, single-spaced, with ā ī ū, ḥ ṣ ḍ ṭ ẓ, ʿ (ʿayn, U+02BF) and ʾ (hamza, U+02BE); no apostrophes or capitals`,
      );

    if (!Array.isArray(w.meanings) || w.meanings.length === 0 || !w.meanings.every(text))
      err('needs at least one meaning');

    if (!Array.isArray(w.examples) || w.examples.length < 1 || w.examples.length > 3) err('needs 1–3 examples');
    for (const ex of w.examples ?? []) {
      if (!ARABIC.test(ex.ar ?? '') || !text(ex.en)) err('example needs ar + en');
    }

    if (w.tags !== undefined) err('tags were replaced by topics (scripts/migrate-tags-to-topics.mjs)');
    if (!Array.isArray(w.topics)) err('topics must be an array of topic ids (may be empty: the whole sea)');
    else {
      if (new Set(w.topics).size !== w.topics.length) err('topics lists a topic twice');
      for (const t of w.topics) {
        if (!topicIds.has(t)) err(`unknown topic "${t}" (see src/data/topics.json)`);
        else perTopic.set(t, perTopic.get(t) + 1);
      }
    }

    // Every word says when it joined, so Pearl of the Day can add it to future cycles without
    // changing days already shown (shared/pearlOfTheDay.ts).
    if (w.added === undefined) err('missing added (ISO date the word joined; keeps Pearl of the Day stable)');
    else if (!DATE.test(w.added) || Number.isNaN(Date.parse(w.added)) || w.added < FIRST_ADDED)
      err(`added must be an ISO date on or after ${FIRST_ADDED}`);

    if (w.etymology !== undefined) {
      const e = w.etymology;
      if (!e || typeof e !== 'object' || !text(e.text)) err('etymology needs text');
      if (!e || !text(e.source)) err('etymology needs a source');
    }
    if (w.topics?.includes(BORROWED_TOPIC) && !text(w.etymology?.source))
      err(`words in "${BORROWED_TOPIC}" need etymology.source`);

    if (w.image !== undefined) {
      const im = w.image;
      if (!im || typeof im !== 'object') err('image must be an object');
      else {
        if (!IMAGE_SRC.test(im.src ?? '')) err('image.src must be an image key (e.g. illustrations/ward.webp) or https URL');
        if (!text(im.alt)) err('image needs alt text');
        if (!text(im.credit)) err('image needs a credit');
        if (!text(im.license)) err('image needs a license');
        if (im.sourceUrl !== undefined && !HTTPS.test(im.sourceUrl)) err('image.sourceUrl must be an https URL');
      }
    }
  });

  if (words.length < 100 || words.length > 1000) errors.push(`expected 100–1000 words, found ${words.length}`);
  for (const [id, n] of perTopic) {
    if (n < TOPIC_TARGET) warnings.push(`topic "${id}" has ${n} word${n === 1 ? '' : 's'} (target ${TOPIC_TARGET})`);
  }
  return { errors, warnings };
}
