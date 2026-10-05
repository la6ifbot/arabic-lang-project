// Monitoring and GDPR (Phase 0.7): who may read the job status and error log, the weekly digest's
// numbers, retention, and "Download my data", against real PostgreSQL.
//   DATABASE_URL=postgres://… npm run test:db
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const ROOT = new URL('../..', import.meta.url).pathname;
const ADMIN_URL = process.env.DATABASE_URL;
const DB = `durar_monitoring_${process.pid}`;

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
const one = async (sql, params) => (await q(sql, params)).rows[0].v;

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
    `insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at)
     values ($1, 'alice@example.com', '{"provider":"email"}', '{"sea_topic":"sky"}', '2026-10-01T10:00:00Z'),
            ($2, 'bob@example.com', '{"provider":"google"}', null, '2026-10-20T10:00:00Z')`,
    [alice, bob],
  );
});

after(async () => {
  await db?.end();
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB}`);
  await admin.end();
});

const SERVER_ONLY = [
  `select public.ops_report('backup', true, '{}'::jsonb)`,
  `select public.ops_status()`,
  `select public.error_log_record('x', null, 'y')`,
  `select public.health_ping()`,
  `select public.weekly_digest_stats('2026-10-19', '2026-10-26')`,
  `select public.deep_digest_stats(now(), now())`,
  `select public.deep_export_for('${randomUUID()}')`,
  `select * from public.ops_checks`,
  `select * from public.error_log`,
];

describe('monitoring: access', () => {
  test('anon and signed-in users cannot read the job status or error log, or call the server functions', async () => {
    for (const sql of SERVER_ONLY) {
      await assert.rejects(anon(() => q(sql)), /permission denied/, `anon: ${sql}`);
      await assert.rejects(user(alice, () => q(sql)), /permission denied/, `user: ${sql}`);
    }
  });

  test('the service role records and reads job status; a failure keeps the last success time', async () => {
    await server(() => q(`select public.ops_report('backup', true, '{"bytes": 1234}'::jsonb)`));
    const ok = await server(() => one(`select public.ops_status() as v`));
    assert.equal(ok.backup.last_ok, true);
    assert.ok(ok.backup.last_ok_at);
    await server(() => q(`select public.ops_report('backup', false)`));
    const failed = await server(() => one(`select public.ops_status() as v`));
    assert.equal(failed.backup.last_ok, false);
    assert.equal(failed.backup.last_ok_at, ok.backup.last_ok_at);
    assert.equal(await server(() => one(`select public.health_ping() as v`)), true);
  });

  test('a job can report when it ran (the restore test time copied by the nightly backup), never moving backwards', async () => {
    await server(() => q(`select public.ops_report('restore_test', true, '{}'::jsonb, '2026-10-01T03:00:00Z')`));
    await server(() => q(`select public.ops_report('restore_test', true, '{}'::jsonb, '2026-09-01T03:00:00Z')`));
    const s = await server(() => one(`select public.ops_status() as v`));
    assert.equal(new Date(s.restore_test.last_ok_at).toISOString(), '2026-10-01T03:00:00.000Z');
  });

  test('job names and detail size are checked', async () => {
    await assert.rejects(server(() => q(`select public.ops_report('Robert''); drop table x', true)`)), /check/);
    await assert.rejects(server(() => q(`select public.ops_report('big', true, jsonb_build_object('x', repeat('a', 5000)))`)), /check/);
  });

  test('error log messages are cut to 300 characters', async () => {
    await server(() => q(`select public.error_log_record('daily:send', 'Error', repeat('a', 400))`));
    const len = await server(() => one(`select max(char_length(message)) as v from public.error_log`));
    assert.equal(len, 300);
  });
});

describe('retention', () => {
  test('housekeeping deletes error log rows after 30 days and keeps recent ones', async () => {
    await q(`delete from public.error_log`);
    await q(`insert into public.error_log (source, at) values ('old', now() - interval '31 days'), ('recent', now() - interval '29 days')`);
    const r = await server(() => one(`select public.subscriptions_housekeeping() as v`));
    assert.equal(r.old_errors, 1);
    assert.deepEqual((await q(`select source from public.error_log`)).rows, [{ source: 'recent' }]);
    // The existing cleanups are still there.
    for (const k of ['expired_pending', 'old_attempts', 'old_sends', 'old_runs']) assert.ok(k in r, k);
  });
});

describe('weekly digest numbers', () => {
  test('counts only the Amsterdam week, across the end of summer time (25 Oct 2026)', async () => {
    await q(`delete from public.error_log`);
    // Week of Monday 19 Oct 00:00 CEST (18 Oct 22:00 UTC) to Monday 26 Oct 00:00 CET (25 Oct 23:00 UTC).
    const subs = await q(
      `insert into public.subscribers (email, status, confirmed_at, unsubscribed_at, updated_at) values
         ('in1@example.com', 'confirmed', '2026-10-18T22:30:00Z', null, now()),
         ('out1@example.com', 'confirmed', '2026-10-18T21:30:00Z', null, now()),
         ('in2@example.com', 'confirmed', '2026-10-25T22:30:00Z', null, now()),
         ('out2@example.com', 'confirmed', '2026-10-25T23:30:00Z', null, now()),
         ('gone@example.com', 'unsubscribed', '2026-10-01T08:00:00Z', '2026-10-21T08:00:00Z', now()),
         ('bounce@example.com', 'bounced', '2026-10-01T08:00:00Z', null, '2026-10-22T08:00:00Z')
       returning id`,
    );
    const id = subs.rows[0].id;
    await q(
      `insert into public.daily_sends (subscriber_id, send_date, word_slug, status) values
         ($1, '2026-10-19', 'bahr', 'sent'), ($1, '2026-10-25', 'bahr', 'sent'), ($1, '2026-10-26', 'bahr', 'sent'), ($1, '2026-10-20', 'bahr', 'failed')`,
      [id],
    );
    await q(
      `insert into public.word_progress (user_id, word_slug, box, due_at, last_reviewed_at) values
         ($1, 'bahr', 2, now(), '2026-10-20T08:00:00Z'), ($1, 'najm', 1, now(), '2026-10-27T08:00:00Z'),
         ($2, 'bahr', 1, now(), '2026-10-25T22:59:00Z')`,
      [alice, bob],
    );
    await q(`insert into public.error_log (source, at) values ('daily:send', '2026-10-20T08:00:00Z'), ('daily:send', '2026-10-21T08:00:00Z'), ('subscribe', '2026-10-21T08:00:00Z'), ('subscribe', '2026-10-27T08:00:00Z')`);

    const s = await server(() => one(`select public.weekly_digest_stats('2026-10-19', '2026-10-26') as v`));
    assert.equal(s.from, '2026-10-19');
    assert.deepEqual(s.subscribers, { total: 4, new: 2, unsubscribed: 1, pending: 0 });
    assert.equal(s.emails.sent, 2);
    assert.equal(s.emails.failed, 1);
    assert.equal(s.emails.bounces, 1);
    assert.equal(s.emails.complaints, 0);
    assert.deepEqual(s.accounts, { total: 2, new: 1 });
    assert.deepEqual(s.reviews, { words: 2, people: 2 });
    assert.equal(s.deep, null);
    assert.deepEqual(s.errors, { total: 3, by_source: { 'daily:send': 2, subscribe: 1 } });
    assert.equal(s.ops.backup.last_ok, false);
    // Aggregate counts only: no addresses or ids anywhere in the result.
    const text = JSON.stringify(s);
    assert.doesNotMatch(text, /@/);
    assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});

describe('download my data', () => {
  test('signed-out visitors cannot export anything', async () => {
    await assert.rejects(anon(() => q(`select public.export_my_data()`)), /permission denied/);
  });

  test('a user gets their own account, pearls, progress and subscription, and nobody else’s', async () => {
    await q(`insert into public.saved_pearls (user_id, word_slug) values ($1, 'durrah'), ($2, 'najm')`, [alice, bob]);
    await q(`insert into public.subscribers (email, status, user_id, confirmed_at) values ('alice@example.com', 'confirmed', $1, now())`, [alice]);
    const d = await user(alice, () => one(`select public.export_my_data() as v`));
    assert.equal(d.account.email, 'alice@example.com');
    assert.equal(d.account.sign_in_method, 'email');
    assert.equal(d.account.sea_topic, 'sky');
    assert.ok(d.account.created_at.startsWith('2026-10-01'));
    assert.deepEqual(d.saved_pearls.map((p) => p.word), ['durrah']);
    assert.deepEqual(d.progress.map((p) => p.word), ['bahr', 'najm']);
    assert.equal(d.progress[0].box, 2);
    assert.equal(d.email_subscription.status, 'confirmed');
    assert.equal(d.the_deep, null);
    assert.doesNotMatch(JSON.stringify(d), /bob@example\.com/);

    const b = await user(bob, () => one(`select public.export_my_data() as v`));
    assert.deepEqual(b.saved_pearls.map((p) => p.word), ['najm']);
    assert.equal(b.email_subscription, null);
    assert.equal(b.account.sign_in_method, 'google');
  });

  test('after deleting the account nothing of it is left to export', async () => {
    await user(alice, () => q(`select public.delete_my_account()`));
    for (const t of ['saved_pearls', 'word_progress']) {
      assert.equal(Number((await q(`select count(*) from public.${t} where user_id = $1`, [alice])).rows[0].count), 0, t);
    }
    assert.equal(Number((await q(`select count(*) from public.subscribers where email = 'alice@example.com'`)).rows[0].count), 0);
    const d = await user(alice, () => one(`select public.export_my_data() as v`));
    assert.equal(d.account.email, null);
    assert.deepEqual(d.saved_pearls, []);
    assert.deepEqual(d.progress, []);
    assert.equal(d.email_subscription, null);
  });
});
