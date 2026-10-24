// The Deep: server-side review rules, verified progress, names, the boards, leaving and deleting,
// and the GDPR hooks, against real PostgreSQL.
//   DATABASE_URL=postgres://… npm run test:db
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const ROOT = new URL('../..', import.meta.url).pathname;
const ADMIN_URL = process.env.DATABASE_URL;
const DB = `durar_deep_${process.pid}`;

if (!ADMIN_URL) {
  console.error('DATABASE_URL is not set — skipping database tests.');
  process.exit(process.env.CI ? 1 : 0);
}

const [alice, bob, cara, dan, eve] = Array.from({ length: 5 }, () => randomUUID());
let db;

async function as(role, uid, fn) {
  await db.query('begin');
  try {
    await db.query(`set local role ${role}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role } : { role })]);
    const result = await fn();
    await db.query('commit');
    return result;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
const q = (sql, params) => db.query(sql, params);
const user = (uid, fn) => as('authenticated', uid, fn);
const anon = (fn) => as('anon', null, fn);
const one = async (uid, sql, params) => (await user(uid, () => q(sql, params))).rows[0];

const review = (uid, slug, dir) => one(uid, `select public.record_review($1, $2) as r`, [slug, dir]).then((x) => x.r);
const reviews = (uid, list) => one(uid, `select public.record_reviews($1::jsonb) as r`, [JSON.stringify(list)]).then((x) => x.r);
const merge = (uid, rows) => one(uid, `select public.save_progress($1::jsonb) as n`, [JSON.stringify(rows)]);
const join_ = (uid, name = null, script = 'latin') => one(uid, `select public.deep_join($1, $2) as me`, [name, script]).then((x) => x.me);
const rename = (uid, name = null, script = 'latin') => one(uid, `select public.deep_rename($1, $2) as me`, [name, script]).then((x) => x.me);
const me = (uid) => one(uid, `select public.deep_me() as me`).then((x) => x.me);
const problem = async (name) => (await q(`select public.deep_name_problem($1) as p`, [name])).rows[0].p;
const progress = async (uid, slug) =>
  (await q(`select box, verified_box, lapses, times_seen, due_at from public.word_progress where user_id = $1 and word_slug = $2`, [uid, slug])).rows[0];
/** Moves a word's clocks back, as if `days` had passed since its last review. */
const age = (uid, slug, days) =>
  q(
    `update public.word_progress set due_at = due_at - make_interval(days => $3), verified_at = verified_at - make_interval(days => $3),
            last_reviewed_at = last_reviewed_at - make_interval(days => $3) where user_id = $1 and word_slug = $2`,
    [uid, slug, days],
  );
const board = async (name) =>
  (await anon(() => q(`select rank, name, score, pearls from public.deep_board where board = $1 order by rank`, [name]))).rows;
const refresh = () => q(`select public.deep_refresh_boards()`);
const iso = (ms) => new Date(ms).toISOString();

before(async () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB}`);
  await admin.query(`create database ${DB}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${DB}`;
  db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  await q(readFileSync(join(ROOT, 'tests/db/supabase-shim.sql'), 'utf8'));
  const dir = join(ROOT, 'supabase/migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await q(readFileSync(join(dir, f), 'utf8'));
  await q(
    `insert into auth.users (id, email) values ($1, 'alice@example.com'), ($2, 'bob@example.com'), ($3, 'cara@example.com'),
       ($4, 'dan@example.com'), ($5, 'eve@example.com')`,
    [alice, bob, cara, dan, eve],
  );
});

after(async () => {
  await db?.end();
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB}`);
  await admin.end();
});

describe('record_review: the rules run on the server', () => {
  test('a new word: right → box 2, left → box 1; both verified', async () => {
    const r = await review(alice, 'bahr', 'known');
    assert.deepEqual([r.word_slug, r.box, r.moved, r.times_seen], ['bahr', 2, true, 1]);
    assert.equal((await progress(alice, 'bahr')).verified_box, 2);
    const l = await review(alice, 'najm', 'learning');
    assert.deepEqual([l.box, l.lapses], [1, 0]);
    assert.equal((await progress(alice, 'najm')).verified_box, 1);
  });

  test('right on a word that isn’t due: nothing moves', async () => {
    const r = await review(alice, 'bahr', 'known');
    assert.deepEqual([r.box, r.moved, r.times_seen], [2, false, 1]);
    assert.equal((await progress(alice, 'bahr')).verified_box, 2);
  });

  test('right on a due word: one box deeper, with the new due time; box 5 is the floor', async () => {
    await age(alice, 'bahr', 3);
    const r = await review(alice, 'bahr', 'known');
    assert.deepEqual([r.box, r.moved], [3, true]);
    assert.ok(Math.abs(Date.parse(r.due_at) - Date.now() - 7 * 86_400_000) < 60_000);
    for (const days of [7, 16, 35]) {
      await age(alice, 'bahr', days);
      await review(alice, 'bahr', 'known');
    }
    assert.deepEqual(await progress(alice, 'bahr').then((p) => [p.box, p.verified_box]), [5, 5]);
    await age(alice, 'bahr', 35);
    assert.equal((await review(alice, 'bahr', 'known')).box, 5);
  });

  test('left: back to box 1 at once, due tomorrow, with a lapse', async () => {
    const r = await review(alice, 'bahr', 'learning');
    assert.deepEqual([r.box, r.lapses, r.moved], [1, 1, true]);
    assert.equal((await progress(alice, 'bahr')).verified_box, 1);
  });

  test('bad input is refused; signed-out callers can’t review', async () => {
    await assert.rejects(review(alice, 'bahr', 'sideways'), /known or learning/);
    await assert.rejects(review(alice, '<script>', 'known'), /not a word/);
    await assert.rejects(anon(() => q(`select public.record_review('bahr', 'known')`)), /permission denied/);
    await assert.rejects(reviews(alice, Array.from({ length: 101 }, () => ({ slug: 'bahr', dir: 'known' }))), /at most 100/);
  });

  test('a batch is applied in order and returns each row', async () => {
    const out = await reviews(bob, [
      { slug: 'qamar', dir: 'known' },
      { slug: 'qamar', dir: 'known' },
      { slug: 'ward', dir: 'learning' },
    ]);
    assert.deepEqual(
      out.map((r) => [r.word_slug, r.box, r.moved]),
      [
        ['qamar', 2, true],
        ['qamar', 2, false],
        ['ward', 1, true],
      ],
    );
  });

  test('rate limit: at most 120 reviews a minute; nothing in a refused batch is applied', async () => {
    const batch = (from, n) => Array.from({ length: n }, (_, i) => ({ slug: `rate-${from + i}`, dir: 'known' }));
    await reviews(cara, batch(0, 60));
    await assert.rejects(reviews(cara, batch(100, 61)), /too many reviews/);
    assert.equal((await q(`select count(*)::int as n from public.word_progress where user_id = $1`, [cara])).rows[0].n, 60);
    await q(`delete from public.word_progress where user_id = $1`, [cara]);
    await q(`delete from public.review_rate where user_id = $1`, [cara]);
  });
});

describe('verified progress', () => {
  const browserRow = (slug, box, dueDays) => ({
    word_slug: slug,
    box,
    due_at: iso(Date.now() + dueDays * 86_400_000),
    last_reviewed_at: iso(Date.now() - 86_400_000),
    times_seen: 3,
    lapses: 0,
  });

  test('merged browser progress keeps working for the person but starts unverified', async () => {
    await merge(dan, [browserRow('sabr', 4, 5)]);
    const p = await progress(dan, 'sabr');
    assert.deepEqual([p.box, p.verified_box], [4, 0]);
  });

  test('its next real review verifies it, climbing again from box 2', async () => {
    await merge(dan, [browserRow('amal', 4, -1)]); // due now
    const r = await review(dan, 'amal', 'known');
    assert.equal(r.box, 5);
    assert.equal((await progress(dan, 'amal')).verified_box, 2);
  });

  test('a browser copy can’t fake depth: a re-merged "due" box 5 doesn’t move the verified box early', async () => {
    await merge(dan, [{ ...browserRow('amal', 5, -10), last_reviewed_at: iso(Date.now()) }]);
    await review(dan, 'amal', 'known');
    assert.equal((await progress(dan, 'amal')).verified_box, 2);
  });

  test('a merge never raises a verified box, but a newer lower box lowers it', async () => {
    await review(dan, 'hanin', 'known'); // verified 2
    await merge(dan, [{ ...browserRow('hanin', 1, 1), last_reviewed_at: iso(Date.now() + 1000) }]);
    assert.deepEqual(await progress(dan, 'hanin').then((p) => [p.box, p.verified_box]), [1, 1]);
  });
});

describe('names', () => {
  test('shape rules', async () => {
    const cases = {
      'Layla': null,
      '  Layla   of  the sea ': null,
      'لؤلؤة البحر': null,
      'غَوّاصة': null,
      'Dāna_7': null,
      'Ab': 'length',
      'An extremely long diver name': 'length',
      'Layla🌊': 'characters',
      'Lay‮la': 'characters',
      '_Layla': 'characters',
      'La--yla': 'characters',
      '123': 'characters',
      'Layla لؤلؤة': 'mixed',
      'Durar': 'reserved',
      'ADMIN': 'reserved',
      'دُرَر': 'reserved',
      'Diver 142': 'reserved',
      'diver_77': 'reserved',
      'غوّاص ١٤٢': 'reserved',
      'shitstorm': 'not_allowed',
      'F.u.c.k': 'not_allowed',
      'sh1t': 'not_allowed',
      'Big Dick': 'not_allowed',
      'Hancock': null,
      'Grapevine': null,
      'شرموطة': 'not_allowed',
      'يا كس': 'not_allowed',
      'كسرة': null,
    };
    for (const [name, want] of Object.entries(cases)) assert.equal(await problem(name), want, name);
  });

  test('join with a chosen name; it must be unique, ignoring case, marks and digit style', async () => {
    const m = await join_(alice, '  Layla   of the sea ');
    assert.equal(m.name, 'Layla of the sea');
    assert.equal(m.generated, false);
    await assert.rejects(join_(bob, 'LAYLA OF THE SEA'), /deep_name:taken/);
    await assert.rejects(join_(bob, 'Durar'), /deep_name:reserved/);
    await assert.rejects(join_(bob, 'Ab'), /deep_name:length/);
    // Joining twice changes nothing.
    assert.equal((await join_(alice, 'Someone else')).name, 'Layla of the sea');
  });

  test('or take a generated one, in English or Arabic', async () => {
    assert.match((await join_(bob)).name, /^Diver \d+$/);
    assert.match((await join_(cara, null, 'arabic')).name, /^غوّاص [٠-٩]+$/);
    assert.equal((await me(bob)).generated, true);
  });

  test('rename: once, then not again for a day', async () => {
    const r = await rename(bob, 'Bob the Diver');
    assert.equal(r.name, 'Bob the Diver');
    assert.ok(r.next_rename_at);
    await assert.rejects(rename(bob, 'Bob again'), /deep_rename_too_soon/);
    await q(`update public.deep_members set renamed_at = now() - interval '25 hours' where user_id = $1`, [bob]);
    assert.equal((await rename(bob, 'Bob again')).name, 'Bob again');
  });

  test('only the functions touch members; nobody reads them directly', async () => {
    await assert.rejects(user(alice, () => q(`select * from public.deep_members`)), /permission denied/);
    await assert.rejects(anon(() => q(`select * from public.deep_members`)), /permission denied/);
    await assert.rejects(user(alice, () => q(`select * from public.deep_scores`)), /permission denied/);
    await assert.rejects(user(alice, () => q(`update public.deep_board set score = 999`)), /permission denied/);
    await assert.rejects(anon(() => q(`select public.deep_join('Anon', 'latin')`)), /permission denied/);
  });
});

describe('the boards', () => {
  test('expose only rank, name and score (and pearls), to everyone', async () => {
    const cols = (await q(`select column_name from information_schema.columns where table_name = 'deep_board' order by ordinal_position`)).rows;
    assert.deepEqual(
      cols.map((c) => c.column_name),
      ['board', 'rank', 'name', 'score', 'pearls'],
    );
    const info = (await q(`select column_name from information_schema.columns where table_name = 'deep_board_info' order by ordinal_position`)).rows;
    assert.deepEqual(
      info.map((c) => c.column_name),
      ['board', 'divers', 'week_start', 'refreshed_at'],
    );
  });

  test('ranked by depth; ties go to whoever got there first; your own rank by function', async () => {
    // alice (Layla of the sea): verified najm 1 + bahr 1 = 2. bob: qamar 2 + ward 1 = 3. cara: 0 (not ranked).
    await refresh();
    let all = await board('all');
    assert.deepEqual(
      all.map((r) => [r.rank, r.name, r.score]),
      [
        [1, 'Bob again', 3],
        [2, 'Layla of the sea', 2],
      ],
    );
    // alice reaches 3 later than bob: still second.
    await review(alice, 'durrah', 'learning');
    await refresh();
    all = await board('all');
    assert.deepEqual(
      all.map((r) => [r.rank, r.name, r.score]),
      [
        [1, 'Bob again', 3],
        [2, 'Layla of the sea', 3],
      ],
    );
    const mine = await me(alice);
    assert.deepEqual(mine.all, { rank: 2, score: 3, pearls: 0 });
    assert.deepEqual(mine.live, { depth: 3, pearls: 0, week: 3 });
    assert.equal((await q(`select divers from public.deep_board_info where board = 'all'`)).rows[0].divers, 2);
    assert.equal(await me(eve), null);
  });

  test('people who haven’t joined never appear, however deep they are', async () => {
    await review(eve, 'bahr', 'known');
    await review(eve, 'najm', 'known');
    await refresh();
    assert.ok(!(await board('all')).some((r) => r.score === 4));
  });

  test('This week counts the depth gained since Monday 00:00 Amsterdam, and starts afresh each week', async () => {
    assert.deepEqual(
      (await board('week')).map((r) => r.name),
      ['Bob again', 'Layla of the sea'],
    );
    // A new week: every gain so far belongs to the old one.
    await q(`update public.deep_scores set week_start = week_start - 7`);
    await refresh();
    assert.deepEqual(await board('week'), []);
    assert.equal((await me(alice)).week, null);
    await age(alice, 'durrah', 1);
    await review(alice, 'durrah', 'known'); // 1 → 2: +1 this week
    await refresh();
    assert.deepEqual(
      (await board('week')).map((r) => [r.rank, r.name, r.score]),
      [[1, 'Layla of the sea', 1]],
    );
  });

  test('the week starts on Monday 00:00 in Amsterdam, summer or winter', async () => {
    const wk = async (t) => (await q(`select public.deep_week_start($1::timestamptz)::text as d`, [t])).rows[0].d;
    assert.equal(await wk('2026-10-25T22:59:00Z'), '2026-10-19'); // Sunday 23:59 CET, the day summer time ended
    assert.equal(await wk('2026-10-25T23:00:00Z'), '2026-10-26'); // Monday 00:00 CET
    assert.equal(await wk('2027-03-28T21:59:00Z'), '2027-03-22'); // Sunday 23:59 CEST, the day summer time began
    assert.equal(await wk('2027-03-28T22:00:00Z'), '2027-03-29'); // Monday 00:00 CEST
  });

  test('reset lowers the score (the board catches up at the next rebuild)', async () => {
    await review(dan, 'najm', 'known');
    await join_(dan, 'Dan');
    const before = (await me(dan)).live.depth;
    await user(dan, () => q(`select public.reset_my_progress()`));
    assert.equal((await me(dan)).live.depth, 0);
    assert.ok(before > 0);
    await refresh();
    assert.ok(!(await board('all')).some((r) => r.name === 'Dan'));
  });
});

describe('leaving, deleting and moderation', () => {
  test('rename shows on the board at once', async () => {
    await q(`update public.deep_members set renamed_at = null where user_id = $1`, [alice]);
    await rename(alice, 'Layla');
    assert.ok((await board('all')).some((r) => r.name === 'Layla'));
    assert.ok(!(await board('all')).some((r) => r.name === 'Layla of the sea'));
  });

  test('leave: the name disappears from both boards at once; progress stays', async () => {
    await user(alice, () => q(`select public.deep_leave()`));
    assert.ok(!(await board('all')).some((r) => r.name === 'Layla'));
    assert.ok(!(await board('week')).some((r) => r.name === 'Layla'));
    assert.equal(await me(alice), null);
    assert.ok((await progress(alice, 'durrah')).box > 0);
    // The name is free again.
    await join_(alice, 'Layla');
  });

  test('moderation: hide gives a generated name and keeps the old one from being chosen again', async () => {
    const msg = (await q(`select public.deep_hide('layla') as m`)).rows[0].m;
    assert.match(msg, /^Hidden: Layla is now Diver \d+\.$/);
    assert.match((await me(alice)).name, /^Diver \d+$/);
    assert.equal(await problem('Layla'), 'reserved');
    assert.ok(!(await board('all')).some((r) => r.name === 'Layla'));
    assert.match((await q(`select public.deep_remove('Nobody here') as m`)).rows[0].m, /No diver/);
  });

  test('Download my data includes your own entry only', async () => {
    const d = await one(bob, `select public.export_my_data() as d`).then((x) => x.d);
    assert.equal(d.the_deep.name, 'Bob again');
    assert.deepEqual(Object.keys(d.the_deep).sort(), [
      'depth',
      'depth_gained_this_week',
      'generated_name',
      'joined_at',
      'name',
      'pearls_in_the_deep',
      'renamed_at',
    ]);
    const e = await one(eve, `select public.export_my_data() as d`).then((x) => x.d);
    assert.equal(e.the_deep, null);
  });

  test('the weekly digest counts divers', async () => {
    const s = (await q(`select public.deep_digest_stats(now() - interval '7 days', now() + interval '1 minute') as s`)).rows[0].s;
    assert.deepEqual(s, { participants: 4, joined: 4 });
  });

  test('deleting the account removes the entry and the name at once', async () => {
    await user(bob, () => q(`select public.delete_my_account()`));
    assert.ok(!(await board('all')).some((r) => r.name === 'Bob again'));
    assert.equal((await q(`select count(*)::int as n from public.deep_members where user_id = $1`, [bob])).rows[0].n, 0);
    assert.equal((await q(`select count(*)::int as n from public.deep_scores where user_id = $1`, [bob])).rows[0].n, 0);
  });

  test('every new table has row level security on', async () => {
    const { rows } = await q(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    assert.deepEqual(rows, []);
  });
});
