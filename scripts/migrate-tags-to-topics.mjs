// One-off migration (Phase 0.6): replaces each word's free-form `tags` with `topics` (ids from
// src/data/topics.json) and gives the original 140 words an explicit `added` date.
//
//   node scripts/migrate-tags-to-topics.mjs          rewrite src/data/words.json
//   node scripts/migrate-tags-to-topics.mjs --check  print the mapping, change nothing
//
// It is idempotent: words that already have `topics` are left alone.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The original set's `added` date: Pearl of the Day's first day. A word counts as a member of every
 * cycle starting on or after its `added` date, and no cycle starts before this one, so giving the
 * original words this date leaves every day's pearl exactly as it was (tests/unit/topics.test.ts).
 */
export const ORIGINAL_ADDED = '2026-09-24';

/** Default topics for each old tag. Tags mapped to [] only place a word through OVERRIDES. */
export const TAG_TO_TOPICS = {
  sea: ['water'],
  sky: ['sky'],
  weather: ['sky'],
  emotion: ['feeling'],
  virtue: ['feeling'],
  mind: ['feeling'],
  desert: ['desert'],
  scent: ['flowers'],
  language: ['poetry'],
  poetry: ['poetry'],
  music: ['poetry'],
  sound: ['poetry'],
  gem: [],
  light: [],
  nature: [],
  time: [],
  place: [],
  people: [],
  creature: [],
};

/** Per-word corrections on top of the tag defaults. */
export const OVERRIDES = {
  // Rain, dew, springs and streams are water as well as weather.
  matar: { add: ['water'] },
  ghayth: { add: ['water'] },
  dimah: { add: ['water'] },
  nada: { add: ['water'] },
  nab: { add: ['water'] },
  jadwal: { add: ['water'] },
  nafurah: { add: ['water'] },
  // Light of the sky and the bright morning.
  nur: { add: ['sky'] },
  diya: { add: ['sky'] },
  duha: { add: ['sky'] },
  // Plants and gardens.
  yasamin: { add: ['flowers'] },
  narjis: { add: ['flowers'] },
  ward: { add: ['flowers'] },
  zahrah: { add: ['flowers'] },
  ghusn: { add: ['flowers'] },
  bustan: { add: ['flowers'] },
  zaytun: { add: ['flowers'] },
  firdaws: { add: ['flowers'] },
  // The desert's people, animals and palms.
  nakhlah: { add: ['desert'] },
  saqr: { add: ['desert'] },
  rahhalah: { add: ['desert'] },
  dayf: { add: ['desert'] },
  // Night talk and its companions belong with poetry.
  samar: { add: ['poetry'] },
  nadim: { add: ['poetry'] },
  // "mind" words that aren't feelings.
  sarab: { remove: ['feeling'] },
  jawhar: { remove: ['feeling'] },
  umq: { remove: ['feeling'] },
  // Thunder is weather, not music.
  rad: { remove: ['poetry'] },
};

/** Topic ids for one word, in registry order. */
export function topicsFor(word, order = ['water', 'sky', 'flowers', 'borrowed', 'desert', 'feeling', 'poetry']) {
  const set = new Set();
  for (const tag of word.tags ?? []) {
    const mapped = TAG_TO_TOPICS[tag];
    if (!mapped) throw new Error(`${word.slug}: no mapping for tag "${tag}"`);
    mapped.forEach((t) => set.add(t));
  }
  const o = OVERRIDES[word.slug];
  o?.add?.forEach((t) => set.add(t));
  o?.remove?.forEach((t) => set.delete(t));
  return [...set].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** The migrated word: `tags` becomes `topics` in the same position, followed by `added`. */
export function migrateWord(word, order) {
  if (word.topics) return word;
  const out = {};
  for (const [k, v] of Object.entries(word)) {
    if (k === 'tags') {
      out.topics = topicsFor(word, order);
      out.added = word.added ?? ORIGINAL_ADDED;
    } else if (k !== 'added') out[k] = v;
  }
  out.topics ??= topicsFor(word, order);
  out.added ??= word.added ?? ORIGINAL_ADDED;
  return out;
}

/** words.json keeps one word per line so diffs stay readable. */
export const formatWords = (words) => `[\n${words.map((w) => `  ${JSON.stringify(w)}`).join(',\n')}\n]\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = new URL('../src/data/words.json', import.meta.url);
  const topics = JSON.parse(readFileSync(new URL('../src/data/topics.json', import.meta.url), 'utf8'));
  const order = [...topics].sort((a, b) => a.order - b.order).map((t) => t.id);
  const words = JSON.parse(readFileSync(url, 'utf8'));
  const migrated = words.map((w) => migrateWord(w, order));
  if (process.argv.includes('--check')) {
    for (const t of order) {
      const list = migrated.filter((w) => w.topics.includes(t));
      console.log(`${t} (${list.length}): ${list.map((w) => w.slug).join(', ')}`);
    }
    const none = migrated.filter((w) => w.topics.length === 0);
    console.log(`whole sea only (${none.length}): ${none.map((w) => w.slug).join(', ')}`);
  } else {
    writeFileSync(url, formatWords(migrated));
    console.log(`✓ migrated ${migrated.length} words`);
  }
}
