// Row Level Security tests for saved_pearls, run against a real PostgreSQL server:
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
// A throwaway database is created, the Supabase shim and every migration are applied, then each
// test acts as a signed-in user exactly the way PostgREST does (role + JWT claims).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const ROOT = new URL('../..', import.meta.url).pathname;
const ADMIN_URL = process.env.DATABASE_URL;
const DB = `durar_rls_${process.pid}`;

if (!ADMIN_URL) {
  console.error('DATABASE_URL is not set — skipping database tests.');
  process.exit(process.env.CI ? 1 : 0);
}

const alice = randomUUID();
const bob = randomUUID();
let db;

async function as(uid, fn) {
  await db.query('begin');
  try {
    await db.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role: 'authenticated' } : { role: 'anon' })]);
    const result = await fn();
    await db.query('commit');
    return result;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

const q = (sql, params) => db.query(sql, params);
const count = async (sql, params) => Number((await q(sql, params)).rows[0].count);

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
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await q(readFileSync(join(dir, f), 'utf8'));
  }
  await q(`insert into auth.users (id, email) values ($1, 'alice@example.com'), ($2, 'bob@example.com')`, [alice, bob]);
});

after(async () => {
  await db?.end();
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB}`);
  await admin.end();
});

describe('saved_pearls row level security', () => {
  test('a user can save a pearl; user_id defaults to their own id', async () => {
    await as(alice, () => q(`insert into public.saved_pearls (word_slug) values ('bahr'), ('hanin')`));
    const rows = await as(alice, () => q(`select user_id, word_slug from public.saved_pearls order by word_slug`));
    assert.deepEqual(rows.rows, [
      { user_id: alice, word_slug: 'bahr' },
      { user_id: alice, word_slug: 'hanin' },
    ]);
  });

  test("user B cannot read user A's pearls", async () => {
    await as(bob, () => q(`insert into public.saved_pearls (word_slug) values ('najm')`));
    const seen = await as(bob, () => q(`select user_id, word_slug from public.saved_pearls`));
    assert.deepEqual(seen.rows, [{ user_id: bob, word_slug: 'najm' }]);
    assert.equal(await as(bob, () => count(`select count(*) from public.saved_pearls where user_id = $1`, [alice])), 0);
  });

  test("user B cannot insert pearls into user A's list", async () => {
    await assert.rejects(
      as(bob, () => q(`insert into public.saved_pearls (user_id, word_slug) values ($1, 'sabr')`, [alice])),
      /row-level security/,
    );
  });

  test("user B cannot delete user A's pearls", async () => {
    const res = await as(bob, () => q(`delete from public.saved_pearls where user_id = $1`, [alice]));
    assert.equal(res.rowCount, 0);
    assert.equal(await as(alice, () => count(`select count(*) from public.saved_pearls`)), 2);
  });

  test('nobody can update rows (pearls are only added or removed)', async () => {
    await assert.rejects(
      as(alice, () => q(`update public.saved_pearls set word_slug = 'amal' where word_slug = 'bahr'`)),
      /permission denied/,
    );
  });

  test('signed-out (anon) requests cannot read or write', async () => {
    await assert.rejects(as(null, () => q(`select * from public.saved_pearls`)), /permission denied/);
    await assert.rejects(
      as(null, () => q(`insert into public.saved_pearls (user_id, word_slug) values ($1, 'x')`, [alice])),
      /permission denied/,
    );
  });

  test('saving the same word twice is harmless with on conflict do nothing', async () => {
    await as(alice, () => q(`insert into public.saved_pearls (word_slug) values ('bahr') on conflict (user_id, word_slug) do nothing`));
    assert.equal(await as(alice, () => count(`select count(*) from public.saved_pearls where word_slug = 'bahr'`)), 1);
  });

  test('malformed slugs are rejected', async () => {
    await assert.rejects(as(alice, () => q(`insert into public.saved_pearls (word_slug) values ('<script>')`)), /saved_pearls_slug_format/);
  });

  test('a user can remove their own pearl', async () => {
    const res = await as(alice, () => q(`delete from public.saved_pearls where word_slug = 'hanin'`));
    assert.equal(res.rowCount, 1);
  });

  test('the per-user limit trigger still fires for signed-in users', async () => {
    // Trigger function execute rights are revoked from API roles; the trigger must still run.
    const res = await as(alice, () => q(`insert into public.saved_pearls (word_slug) values ('limit-check') returning word_slug`));
    assert.equal(res.rows[0].word_slug, 'limit-check');
    await assert.rejects(as(alice, () => q(`select public.saved_pearls_enforce_limit()`)), /permission denied|trigger functions/);
  });

  test('each user is capped at 1000 pearls', async () => {
    // Bob already has 1; fill up to the cap, then one more must fail.
    await as(bob, () => q(`insert into public.saved_pearls (word_slug) select 'cap-' || g from generate_series(1, 999) g`));
    assert.equal(await as(bob, () => count(`select count(*) from public.saved_pearls`)), 1000);
    await assert.rejects(as(bob, () => q(`insert into public.saved_pearls (word_slug) values ('one-too-many')`)), /pearl limit reached/);
    await as(bob, () => q(`delete from public.saved_pearls where word_slug like 'cap-%'`));
  });

  test('delete_my_account is not callable when signed out', async () => {
    await assert.rejects(as(null, () => q(`select public.delete_my_account()`)), /permission denied/);
  });

  test("delete_my_account removes the caller and their pearls, and nobody else's", async () => {
    await as(alice, () => q(`select public.delete_my_account()`));
    assert.equal(await count(`select count(*) from auth.users where id = $1`, [alice]), 0);
    assert.equal(await count(`select count(*) from public.saved_pearls where user_id = $1`, [alice]), 0);
    assert.equal(await count(`select count(*) from auth.users where id = $1`, [bob]), 1);
    assert.equal(await count(`select count(*) from public.saved_pearls where user_id = $1`, [bob]), 1);
  });
});
