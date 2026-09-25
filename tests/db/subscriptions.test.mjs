// Pearl of the Day subscriptions: access rules and server functions, against real PostgreSQL.
//   DATABASE_URL=postgres://… npm run test:db
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const ROOT = new URL('../..', import.meta.url).pathname;
const ADMIN_URL = process.env.DATABASE_URL;
const DB = `durar_subs_${process.pid}`;

if (!ADMIN_URL) {
  console.error('DATABASE_URL is not set — skipping database tests.');
  process.exit(process.env.CI ? 1 : 0);
}

const alice = randomUUID(); // email account
const gina = randomUUID(); // another account
let db;

/** Runs `fn` as a given API role, the way PostgREST does. */
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
const server = (fn) => as('service_role', null, fn);
const q = (sql, params) => db.query(sql, params);
const one = async (sql, params) => (await q(sql, params)).rows[0];

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
  await q(`insert into auth.users (id, email) values ($1, 'Alice@Example.com'), ($2, 'gina@example.com')`, [alice, gina]);
});

after(async () => {
  await db?.end();
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB}`);
  await admin.end();
});

const request = (email, { ip = 'ip-1', user = null, verified = false, token = randomUUID() } = {}) =>
  server(() => one(`select * from public.subscription_request($1, $2, $3, $4, $5)`, [email, ip, user, verified, token]));

describe('subscribers: access', () => {
  test('anon and signed-in users cannot touch the tables directly', async () => {
    for (const [role, uid] of [
      ['anon', null],
      ['authenticated', alice],
    ]) {
      await assert.rejects(as(role, uid, () => q(`select * from public.subscribers`)), /permission denied/);
      await assert.rejects(as(role, uid, () => q(`select * from public.daily_sends`)), /permission denied/);
      await assert.rejects(as(role, uid, () => q(`insert into public.subscribers (email) values ('x@y.z')`)), /permission denied/);
    }
  });

  test('anon and signed-in users cannot call the server functions', async () => {
    await assert.rejects(as('anon', null, () => q(`select public.subscription_confirm('x')`)), /permission denied/);
    await assert.rejects(as('authenticated', alice, () => q(`select * from public.daily_claim(current_date, 'bahr', 10)`)), /permission denied/);
    await assert.rejects(as('authenticated', alice, () => q(`select public.subscriptions_housekeeping()`)), /permission denied/);
  });

  test('signed-out visitors cannot call the account functions', async () => {
    await assert.rejects(as('anon', null, () => q(`select public.my_subscription()`)), /permission denied/);
    await assert.rejects(as('anon', null, () => q(`select public.unsubscribe_me()`)), /permission denied/);
  });
});

describe('subscribe → confirm → unsubscribe', () => {
  test('a new address starts pending and gets a confirmation email', async () => {
    const r = await request('  Reader@Example.com ', { token: 'tok-reader' });
    assert.equal(r.outcome, 'send_confirmation');
    const row = await server(() => one(`select email, status from public.subscribers where id = $1`, [r.subscriber_id]));
    assert.deepEqual(row, { email: 'reader@example.com', status: 'pending' });
  });

  test('asking again right away sends nothing new (no inbox flooding), and looks the same to the caller', async () => {
    const r = await request('reader@example.com', { ip: 'ip-2' });
    assert.equal(r.outcome, 'noop');
  });

  test('the confirmation token confirms once; later visits say so', async () => {
    assert.equal((await server(() => one(`select public.subscription_confirm('tok-reader') as s`))).s, 'confirmed');
    assert.equal((await server(() => one(`select public.subscription_confirm('tok-reader') as s`))).s, 'already_confirmed');
    assert.equal((await server(() => one(`select public.subscription_confirm('nope') as s`))).s, 'invalid');
  });

  test('confirmation links expire after 7 days', async () => {
    const r = await request('late@example.com', { ip: 'ip-3', token: 'tok-late' });
    await server(() => q(`update public.subscribers set confirm_sent_at = now() - interval '8 days' where id = $1`, [r.subscriber_id]));
    assert.equal((await server(() => one(`select public.subscription_confirm('tok-late') as s`))).s, 'expired');
  });

  test('unsubscribe and resubscribe by id (the server verifies the signed link first)', async () => {
    const { id } = await server(() => one(`select id from public.subscribers where email = 'reader@example.com'`));
    assert.equal((await server(() => one(`select public.subscription_unsubscribe($1) as s`, [id]))).s, 'unsubscribed');
    assert.equal((await server(() => one(`select status from public.subscribers where id = $1`, [id]))).status, 'unsubscribed');
    assert.equal((await server(() => one(`select public.subscription_resubscribe($1) as s`, [id]))).s, 'confirmed');
    assert.equal((await server(() => one(`select public.subscription_unsubscribe($1) as s`, [randomUUID()]))).s, 'unknown');
  });

  test('subscribing again after unsubscribing needs a fresh confirmation', async () => {
    const { id } = await server(() => one(`select id from public.subscribers where email = 'reader@example.com'`));
    await server(() => q(`select public.subscription_unsubscribe($1)`, [id]));
    const r = await request('reader@example.com', { ip: 'ip-4', token: 'tok-again' });
    assert.equal(r.outcome, 'send_confirmation');
    assert.equal((await server(() => one(`select public.subscription_confirm('tok-again') as s`))).s, 'confirmed');
  });

  test('a verified account email (e.g. Google) skips double opt-in and links the account', async () => {
    const r = await request('gina@example.com', { ip: null, user: gina, verified: true });
    assert.equal(r.outcome, 'confirmed');
    const row = await server(() => one(`select status, user_id from public.subscribers where email = 'gina@example.com'`));
    assert.deepEqual(row, { status: 'confirmed', user_id: gina });
  });

  test('more than 5 attempts an hour from one IP are refused', async () => {
    for (let i = 0; i < 5; i++) await request(`spam${i}@example.com`, { ip: 'ip-flood' });
    assert.equal((await request('spam6@example.com', { ip: 'ip-flood' })).outcome, 'rate_limited');
    assert.equal((await server(() => one(`select count(*)::int as n from public.subscribers where email = 'spam6@example.com'`))).n, 0);
  });

  test('bounced or complained addresses are never emailed again', async () => {
    await request('bouncy@example.com', { ip: 'ip-5', verified: true });
    assert.equal((await server(() => one(`select public.subscription_suppress('Bouncy@example.com', 'bounce') as ok`))).ok, true);
    assert.equal((await request('bouncy@example.com', { ip: 'ip-6' })).outcome, 'noop');
    const { id } = await server(() => one(`select id from public.subscribers where email = 'bouncy@example.com'`));
    assert.equal((await server(() => one(`select public.subscription_resubscribe($1) as s`, [id]))).s, 'blocked');
  });
});

describe('daily sending', () => {
  test('claims each confirmed subscriber once per day, even across retries and overlapping runs', async () => {
    const day = '2026-10-01';
    const first = (await server(() => q(`select * from public.daily_claim($1, 'bahr', 2)`, [day]))).rows;
    const second = (await server(() => q(`select * from public.daily_claim($1, 'bahr', 100)`, [day]))).rows;
    const third = (await server(() => q(`select * from public.daily_claim($1, 'bahr', 100)`, [day]))).rows;
    const confirmed = (await server(() => one(`select count(*)::int as n from public.subscribers where status = 'confirmed'`))).n;
    assert.equal(first.length, 2);
    assert.equal(first.length + second.length, confirmed);
    assert.equal(third.length, 0);
    const emails = [...first, ...second].map((r) => r.email);
    assert.equal(new Set(emails).size, emails.length);
    assert.ok(!emails.includes('bouncy@example.com'));
    // A different day is a fresh start.
    assert.equal((await server(() => q(`select * from public.daily_claim('2026-10-02', 'amal', 100)`))).rows.length, confirmed);
  });

  test('sandbox mode only ever reaches allow-listed addresses', async () => {
    const rows = (await server(() => q(`select * from public.daily_claim('2026-10-03', 'najm', 100, array['gina@example.com'])`))).rows;
    assert.deepEqual(rows.map((r) => r.email), ['gina@example.com']);
    assert.equal((await server(() => one(`select public.daily_pending_count('2026-10-03', array['gina@example.com']) as n`))).n, 0);
  });

  test('sends are marked with their message id', async () => {
    const { id } = await server(() => one(`select id from public.subscribers where email = 'gina@example.com'`));
    await server(() => q(`select public.daily_mark($1, '2026-10-03', 'sent', 'ses-123')`, [id]));
    const row = await server(() => one(`select status, message_id from public.daily_sends where subscriber_id = $1 and send_date = '2026-10-03'`, [id]));
    assert.deepEqual(row, { status: 'sent', message_id: 'ses-123' });
  });

  test('housekeeping deletes unconfirmed sign-ups after 7 days', async () => {
    const r = await request('ghost@example.com', { ip: 'ip-7' });
    await server(() => q(`update public.subscribers set confirm_sent_at = now() - interval '8 days', created_at = now() - interval '8 days' where id = $1`, [r.subscriber_id]));
    const res = await server(() => one(`select public.subscriptions_housekeeping() as r`));
    assert.ok(res.r.expired_pending >= 1);
    assert.equal((await server(() => one(`select count(*)::int as n from public.subscribers where email = 'ghost@example.com'`))).n, 0);
  });
});

describe('signed-in users and their own subscription', () => {
  test('my_subscription sees only your own row (by account link or account email)', async () => {
    assert.equal((await as('authenticated', gina, () => one(`select public.my_subscription() as s`))).s, 'confirmed');
    assert.equal((await as('authenticated', alice, () => one(`select public.my_subscription() as s`))).s, 'none');
    // Alice subscribed by email before signing in: her account email (any case) finds it.
    await request('alice@example.com', { ip: 'ip-8', verified: true });
    assert.equal((await as('authenticated', alice, () => one(`select public.my_subscription() as s`))).s, 'confirmed');
  });

  test('unsubscribe_me only affects your own subscription', async () => {
    await as('authenticated', alice, () => q(`select public.unsubscribe_me()`));
    assert.equal((await as('authenticated', alice, () => one(`select public.my_subscription() as s`))).s, 'unsubscribed');
    assert.equal((await as('authenticated', gina, () => one(`select public.my_subscription() as s`))).s, 'confirmed');
  });

  test('deleting an account removes its subscription and send log, and nothing else', async () => {
    const { id } = await server(() => one(`select id from public.subscribers where user_id = $1`, [gina]));
    const before = (await server(() => one(`select count(*)::int as n from public.subscribers`))).n;
    await as('authenticated', gina, () => q(`select public.delete_my_account()`));
    assert.equal((await server(() => one(`select count(*)::int as n from public.subscribers where id = $1`, [id]))).n, 0);
    assert.equal((await server(() => one(`select count(*)::int as n from public.daily_sends where subscriber_id = $1`, [id]))).n, 0);
    assert.equal((await server(() => one(`select count(*)::int as n from public.subscribers`))).n, before - 1);
  });
});

describe('daily run log (monitoring)', () => {
  const record = (p) =>
    server(() =>
      one(`select public.daily_run_record($1, 'bahr', 'sandbox', $2, $3, $4, $5, $6) as s`, [
        '2026-11-02',
        p.claimed,
        p.sent,
        p.failed,
        p.remaining,
        p.error ?? null,
      ]),
    );

  test('only the server can read or write it', async () => {
    await assert.rejects(as('anon', null, () => q(`select * from public.daily_runs`)), /permission denied/);
    await assert.rejects(as('authenticated', alice, () => q(`select public.daily_health(current_date)`)), /permission denied/);
    await assert.rejects(
      as('authenticated', alice, () => q(`select public.daily_run_record(current_date, 'bahr', 'live', 0, 0, 0, 0)`)),
      /permission denied/,
    );
  });

  test('calls in the same window add up, and the status follows the latest call', async () => {
    assert.equal((await record({ claimed: 10, sent: 10, failed: 0, remaining: 3 })).s, 'incomplete');
    assert.equal((await record({ claimed: 3, sent: 2, failed: 1, remaining: 0 })).s, 'had_failures');
    assert.equal((await record({ claimed: 0, sent: 0, failed: 0, remaining: null, error: 'Supabase daily_claim failed: 503' })).s, 'error');
    const h = (await server(() => one(`select public.daily_health('2026-11-02') as h`))).h;
    assert.deepEqual(
      { ...h.run, started_at: undefined, finished_at: undefined },
      {
        run_date: '2026-11-02',
        word_slug: 'bahr',
        mode: 'sandbox',
        claimed: 13,
        sent: 12,
        failed: 1,
        remaining: 0,
        invocations: 3,
        status: 'error',
        last_error: 'Supabase daily_claim failed: 503',
        started_at: undefined,
        finished_at: undefined,
      },
    );
  });

  test('a day with no run reads as null', async () => {
    const h = (await server(() => one(`select public.daily_health('2026-11-03') as h`))).h;
    assert.equal(h.run, null);
    assert.deepEqual(h.sends, { sent: 0, failed: 0, reserved: 0 });
  });
});
