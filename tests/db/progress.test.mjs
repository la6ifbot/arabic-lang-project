// Mastery progress (word_progress): access rules, the merge rule, the cap, reset and the delete
// cascade, against real PostgreSQL.
//   DATABASE_URL=postgres://… npm run test:db
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const ROOT = new URL('../..', import.meta.url).pathname;
const ADMIN_URL = process.env.DATABASE_URL;
const DB = `durar_progress_${process.pid}`;

if (!ADMIN_URL) {
  console.error('DATABASE_URL is not set — skipping database tests.');
  process.exit(process.env.CI ? 1 : 0);
}

const alice = randomUUID();
const bob = randomUUID();
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
const user = (uid, fn) => as('authenticated', uid, fn);
const anon = (fn) => as('anon', null, fn);
const server = (fn) => as('service_role', null, fn);
const q = (sql, params) => db.query(sql, params);
const count = async (sql, params) => Number((await q(sql, params)).rows[0].count);

const row = (slug, box, reviewed, extra = {}) => ({
  word_slug: slug,
  box,
  due_at: new Date(Date.parse(reviewed) + box * 86_400_000).toISOString(),
  last_reviewed_at: reviewed,
  times_seen: 1,
  lapses: 0,
  ...extra,
});
const save = (uid, rows) => user(uid, () => q(`select public.save_progress($1::jsonb) as n`, [JSON.stringify(rows)]));
const mine = (uid) =>
  user(uid, () => q(`select word_slug, box, lapses, times_seen, last_reviewed_at from public.word_progress order by word_slug`)).then((r) => r.rows);

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
  await q(`insert into auth.users (id, email) values ($1, 'alice@example.com'), ($2, 'bob@example.com')`, [alice, bob]);
});

after(async () => {
  await db?.end();
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB}`);
  await admin.end();
});

describe('word_progress row level security', () => {
  test('a user saves progress through save_progress; user_id is always their own', async () => {
    const { rows } = await save(alice, [row('bahr', 2, '2026-09-20T08:00:00Z'), row('hanin', 1, '2026-09-20T08:01:00Z')]);
    assert.equal(rows[0].n, 2);
    assert.deepEqual(
      (await mine(alice)).map((r) => [r.word_slug, r.box]),
      [
        ['bahr', 2],
        ['hanin', 1],
      ],
    );
    assert.equal(await count(`select count(*) from public.word_progress where user_id = $1`, [alice]), 2);
  });

  test("user B cannot read, change or delete user A's progress", async () => {
    await save(bob, [row('najm', 3, '2026-09-20T09:00:00Z')]);
    const seen = await user(bob, () => q(`select word_slug from public.word_progress`));
    assert.deepEqual(seen.rows, [{ word_slug: 'najm' }]);
    const upd = await user(bob, () => q(`update public.word_progress set box = 5 where user_id = $1`, [alice]));
    assert.equal(upd.rowCount, 0);
    const del = await user(bob, () => q(`delete from public.word_progress where user_id = $1`, [alice]));
    assert.equal(del.rowCount, 0);
    await assert.rejects(
      user(bob, () =>
        q(`insert into public.word_progress (user_id, word_slug, box, due_at, last_reviewed_at) values ($1, 'sabr', 1, now(), now())`, [alice]),
      ),
      /row-level security/,
    );
    assert.equal((await mine(alice)).length, 2);
  });

  test('a user cannot move their rows to someone else', async () => {
    await assert.rejects(user(bob, () => q(`update public.word_progress set user_id = $1`, [alice])), /row-level security/);
  });

  test('anon gets nothing', async () => {
    await assert.rejects(anon(() => q(`select * from public.word_progress`)), /permission denied/);
    await assert.rejects(anon(() => q(`select public.save_progress('[]'::jsonb)`)), /permission denied/);
    await assert.rejects(anon(() => q(`select public.reset_my_progress()`)), /permission denied/);
  });

  test('box and slug are checked', async () => {
    await assert.rejects(save(alice, [row('bahr', 6, '2026-09-21T08:00:00Z')]), /word_progress_box_check/);
    await assert.rejects(save(alice, [row('<script>', 1, '2026-09-21T08:00:00Z')]), /word_progress_slug_format/);
  });

  test('the latest last_reviewed_at wins, so an older copy never overwrites a newer one', async () => {
    // Older (e.g. a browser copy from before): ignored.
    await save(alice, [row('bahr', 5, '2026-09-19T08:00:00Z', { times_seen: 9 })]);
    assert.equal((await mine(alice)).find((r) => r.word_slug === 'bahr').box, 2);
    // Newer: replaces it. Lapses and times seen never go down.
    await save(alice, [row('bahr', 1, '2026-09-22T08:00:00Z', { lapses: 1, times_seen: 2 })]);
    const bahr = (await mine(alice)).find((r) => r.word_slug === 'bahr');
    assert.deepEqual([bahr.box, bahr.lapses, bahr.times_seen], [1, 1, 2]);
    // The same word twice in one batch: the later review wins.
    await save(alice, [row('hanin', 3, '2026-09-22T09:00:00Z'), row('hanin', 2, '2026-09-22T08:30:00Z')]);
    assert.equal((await mine(alice)).find((r) => r.word_slug === 'hanin').box, 3);
  });

  test('a review time far in the future is clamped to now', async () => {
    await save(alice, [row('qamar', 2, '2099-01-01T00:00:00Z')]);
    const qamar = (await mine(alice)).find((r) => r.word_slug === 'qamar');
    assert.ok(qamar.last_reviewed_at.getTime() < Date.now() + 10 * 60_000);
  });

  test('batches are limited to 500 rows', async () => {
    const big = Array.from({ length: 501 }, (_, i) => row(`w-${i}`, 1, '2026-09-22T08:00:00Z'));
    await assert.rejects(save(alice, big), /at most 500/);
  });

  test('each user is capped at 5000 words, but existing words can still be updated at the cap', async () => {
    await server(() =>
      q(
        `insert into public.word_progress (user_id, word_slug, box, due_at, last_reviewed_at)
         select $1, 'cap-' || g, 1, now(), now() from generate_series(1, 4999) g`,
        [bob],
      ),
    );
    assert.equal(await count(`select count(*) from public.word_progress where user_id = $1`, [bob]), 5000);
    await assert.rejects(save(bob, [row('one-too-many', 1, '2026-09-22T08:00:00Z')]), /progress limit reached/);
    await save(bob, [row('najm', 4, '2026-09-23T08:00:00Z')]);
    assert.equal((await mine(bob)).find((r) => r.word_slug === 'najm').box, 4);
    await server(() => q(`delete from public.word_progress where word_slug like 'cap-%'`));
  });
});

describe('reset_my_progress', () => {
  test('deletes only the caller’s progress and never their saved pearls', async () => {
    await user(alice, () => q(`insert into public.saved_pearls (word_slug) values ('bahr')`));
    const before = (await mine(bob)).length;
    const { rows } = await user(alice, () => q(`select public.reset_my_progress() as n`));
    assert.ok(rows[0].n > 0);
    assert.equal((await mine(alice)).length, 0);
    assert.equal((await mine(bob)).length, before);
    assert.equal(await count(`select count(*) from public.saved_pearls where user_id = $1`, [alice]), 1);
  });
});

describe('email revisit candidates', () => {
  test('only the service role can list them; only due words of linked subscribers come back', async () => {
    const sub = randomUUID();
    const loner = randomUUID();
    await server(() =>
      q(
        `insert into public.subscribers (id, email, status, user_id) values ($1, 'bob@example.com', 'confirmed', $2), ($3, 'x@example.com', 'confirmed', null)`,
        [sub, bob, loner],
      ),
    );
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    await save(bob, [
      { ...row('sabr', 2, past), due_at: past },
      { ...row('ward', 4, past), due_at: new Date(Date.now() - 86_400_000).toISOString() },
      { ...row('amal', 5, past), due_at: new Date(Date.now() + 86_400_000).toISOString() },
    ]);
    await assert.rejects(user(bob, () => q(`select * from public.revisit_candidates(array[$1]::uuid[])`, [sub])), /permission denied/);
    const { rows } = await server(() => q(`select subscriber_id, word_slug from public.revisit_candidates(array[$1, $2]::uuid[])`, [sub, loner]));
    assert.deepEqual(
      rows.map((r) => [r.subscriber_id, r.word_slug]),
      [
        [sub, 'sabr'],
        [sub, 'ward'],
      ],
    );
  });
});

describe('deleting an account', () => {
  test('delete_my_account cascades to progress, and leaves other users alone', async () => {
    await save(alice, [row('bahr', 2, '2026-09-24T08:00:00Z')]);
    await user(alice, () => q(`select public.delete_my_account()`));
    assert.equal(await count(`select count(*) from public.word_progress where user_id = $1`, [alice]), 0);
    assert.ok(await count(`select count(*) from public.word_progress where user_id = $1`, [bob]) > 0);
  });

  test('deleting the auth user directly cascades too', async () => {
    await q(`delete from auth.users where id = $1`, [bob]);
    assert.equal(await count(`select count(*) from public.word_progress where user_id = $1`, [bob]), 0);
  });
});
