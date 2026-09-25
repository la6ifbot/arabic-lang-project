/**
 * The email handlers end to end against real PostgreSQL (the same SQL functions production uses),
 * with an in-memory mailer. Needs DATABASE_URL; skipped otherwise.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import words from '../../src/data/words.json';
import { loadConfig } from '../../server/config';
import { memorySender } from '../../server/email/memory';
import type { EmailWord } from '../../server/email/templates';
import { buildMime } from '../../server/email/mime';
import { handleConfirm, handleDaily, handleHealth, handleSubscribe, handleUnsubscribe, type AccountUser, type Deps } from '../../server/handlers';
import { pgStore } from '../../server/store';
import { pearlForDate } from '../../shared/pearlOfTheDay';

const ADMIN_URL = process.env.DATABASE_URL;
const DB = `durar_server_${process.pid}`;
const ROOT = join(__dirname, '../..');
const SITE = 'https://durar.example';
const OWNER = 'owner@example.com';

let client: pg.Client;
let clock = new Date('2026-10-01T05:15:00Z'); // 07:15 in Amsterdam (CEST)
const users = new Map<string, AccountUser>();

function makeDeps(env: Record<string, string> = {}) {
  const mailer = memorySender([{ email: 'bounced@example.com', reason: 'bounce' }]);
  const deps: Deps = {
    config: loadConfig({
      SITE_URL: SITE,
      EMAIL_MODE: 'sandbox',
      EMAIL_SANDBOX_TO: `${OWNER}, friend@example.com`,
      EMAIL_FROM: 'Durar <owner@example.com>',
      EMAIL_TOKEN_SECRET: 'x'.repeat(40),
      CRON_SECRET: 'cron-secret',
      CONTACT_EMAIL: 'hello@durar.example',
      SES_RATE_PER_SECOND: '1000',
      ...env,
    }),
    store: pgStore(client),
    mailer,
    words: words as EmailWord[],
    verifyUser: async (t) => users.get(t) ?? null,
    now: () => clock,
    sleep: async () => {},
    log: () => {},
  };
  return { deps, mailer };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${SITE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers }, body: JSON.stringify(body) });
const cron = (query = '', auth = 'Bearer cron-secret') => new Request(`${SITE}/api/cron/daily${query}`, { headers: { authorization: auth } });
const health = (query = '', auth = 'Bearer cron-secret') => new Request(`${SITE}/api/cron/health${query}`, { headers: { authorization: auth } });
const linkParam = (html: string, path: string) => {
  const m = html.match(new RegExp(`${path}\\?token=([^"&\\s]+)`));
  return m ? decodeURIComponent(m[1]) : null;
};

describe.skipIf(!ADMIN_URL)('email handlers (PostgreSQL)', () => {
  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`drop database if exists ${DB}`);
    await admin.query(`create database ${DB}`);
    await admin.end();
    const url = new URL(ADMIN_URL!);
    url.pathname = `/${DB}`;
    client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    await client.query(readFileSync(join(ROOT, 'tests/db/supabase-shim.sql'), 'utf8'));
    for (const f of readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
      await client.query(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'));
    }
  });

  afterAll(async () => {
    await client?.end();
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`drop database if exists ${DB}`);
    await admin.end();
  });

  test('rejects invalid addresses and non-POST requests', async () => {
    const { deps } = makeDeps();
    expect((await handleSubscribe(post('/api/subscribe', { email: 'not-an-email' }), deps)).status).toBe(400);
    expect((await handleSubscribe(new Request(`${SITE}/api/subscribe`), deps)).status).toBe(405);
  });

  test('the honeypot looks like success but stores and sends nothing', async () => {
    const { deps, mailer } = makeDeps();
    const res = await handleSubscribe(post('/api/subscribe', { email: 'bot@example.com', website: 'http://spam' }), deps);
    expect(await res.json()).toEqual({ ok: true, status: 'check_inbox' });
    expect(mailer.sent).toHaveLength(0);
    expect((await client.query(`select 1 from public.subscribers where email = 'bot@example.com'`)).rowCount).toBe(0);
  });

  test('double opt-in: confirmation email → confirm link → confirmed', async () => {
    const { deps, mailer } = makeDeps();
    const res = await handleSubscribe(post('/api/subscribe', { email: ' Owner@Example.com ' }), deps);
    expect(await res.json()).toEqual({ ok: true, status: 'check_inbox' });
    expect(mailer.sent).toHaveLength(1);
    const mail = mailer.sent[0];
    expect(mail.to).toBe(OWNER);
    expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const token = linkParam(mail.html, '/subscribe/confirm');
    expect(token).toBeTruthy();
    expect(await (await handleConfirm(post('/api/confirm', { token }), deps)).json()).toEqual({ status: 'confirmed' });
    expect(await (await handleConfirm(post('/api/confirm', { token }), deps)).json()).toEqual({ status: 'already_confirmed' });
    expect((await handleConfirm(post('/api/confirm', { token: 'forged' }), deps)).status).toBe(400);
  });

  test('the answer is identical whether or not an address is already subscribed (no enumeration)', async () => {
    const { deps } = makeDeps();
    const known = await (await handleSubscribe(post('/api/subscribe', { email: OWNER }, { 'x-forwarded-for': '198.51.100.1' }), deps)).text();
    const unknown = await (await handleSubscribe(post('/api/subscribe', { email: 'someone.new@example.com' }, { 'x-forwarded-for': '198.51.100.1' }), deps)).text();
    expect(known).toBe(unknown);
  });

  test('sandbox mode never emails addresses outside the allow-list', async () => {
    const { deps, mailer } = makeDeps();
    await handleSubscribe(post('/api/subscribe', { email: 'stranger@example.com' }, { 'x-forwarded-for': '198.51.100.2' }), deps);
    expect(mailer.sent).toHaveLength(0);
  });

  test('more than 5 sign-ups an hour from one IP get 429', async () => {
    const { deps } = makeDeps();
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await handleSubscribe(post('/api/subscribe', { email: `flood${i}@example.com` }, { 'x-forwarded-for': '192.0.2.77' }), deps)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  test('a signed-in Google user subscribes their own address without double opt-in', async () => {
    users.set('google-token', { id: '11111111-1111-4111-8111-111111111111', email: 'Friend@Example.com', emailVerifiedByProvider: true });
    await client.query(`insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'friend@example.com')`);
    const { deps, mailer } = makeDeps();
    const res = await handleSubscribe(post('/api/subscribe', { email: 'friend@example.com' }, { authorization: 'Bearer google-token' }), deps);
    expect(await res.json()).toEqual({ ok: true, status: 'confirmed' });
    expect(mailer.sent).toHaveLength(0);
  });

  test('one-click unsubscribe (RFC 8058 form POST) and resubscribe', async () => {
    const { deps, mailer } = makeDeps();
    await handleSubscribe(post('/api/subscribe', { email: 'friend@example.com' }, { 'x-forwarded-for': '198.51.100.3' }), deps);
    // Confirmed already, so no email — build the header link the daily job would send instead:
    const { deps: d2, mailer: m2 } = makeDeps();
    await handleDaily(cron('?test=1'), d2);
    expect(mailer.sent).toHaveLength(0);
    const oneClick = m2.sent[0].headers!['List-Unsubscribe'].slice(1, -1);
    expect(oneClick).toMatch(/^https:\/\/durar\.example\/api\/unsubscribe\?token=/);

    const { id } = (await client.query(`select id from public.subscribers where email = 'friend@example.com'`)).rows[0];
    const { unsubscribeToken } = await import('../../server/tokens');
    const token = unsubscribeToken(id, 'x'.repeat(40));
    const res = await handleUnsubscribe(
      new Request(`${SITE}/api/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
      deps,
    );
    expect(await res.json()).toEqual({ status: 'unsubscribed' });
    expect((await client.query(`select status from public.subscribers where id = $1`, [id])).rows[0].status).toBe('unsubscribed');
    expect(await (await handleUnsubscribe(post('/api/unsubscribe', { token, action: 'resubscribe' }), deps)).json()).toEqual({ status: 'confirmed' });
    expect((await handleUnsubscribe(post('/api/unsubscribe', { token: `${id}.forged` }), deps)).status).toBe(400);
    expect((await handleUnsubscribe(new Request(`${SITE}/api/unsubscribe?token=${token}`), deps)).status).toBe(405);
  });

  test('the daily job needs the cron secret and only sends in the 07:00 Amsterdam hour', async () => {
    const { deps, mailer } = makeDeps();
    expect((await handleDaily(cron('', 'Bearer wrong'), deps)).status).toBe(401);
    clock = new Date('2026-10-01T06:10:00Z'); // 08:10 Amsterdam
    expect(await (await handleDaily(cron(), deps)).json()).toMatchObject({ skipped: 'outside_send_window' });
    expect(mailer.sent).toHaveLength(0);
    clock = new Date('2026-10-01T05:15:00Z');
  });

  test('sends today’s pearl once per subscriber, idempotently, sandbox-only', async () => {
    await client.query(`insert into public.subscribers (email, status, confirmed_at) values ('bounced@example.com', 'confirmed', now())`);
    const { deps, mailer } = makeDeps();
    const first = await (await handleDaily(cron(), deps)).json();
    const expectedSlug = pearlForDate('2026-10-01', words as EmailWord[]);
    expect(first).toMatchObject({ date: '2026-10-01', slug: expectedSlug, mode: 'sandbox', sent: 2, failed: 0, remaining: 0, suppressed: 1 });
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(['friend@example.com', OWNER]);
    const mail = mailer.sent[0];
    expect(mail.html).toContain(`${SITE}/word/${expectedSlug}`);
    expect(mail.headers?.['List-Unsubscribe']).toMatch(/^<https:\/\/durar\.example\/api\/unsubscribe\?token=/);
    // A retry, or a second scheduler call in the same hour, sends nothing new.
    const second = await (await handleDaily(cron(), deps)).json();
    expect(second).toMatchObject({ sent: 0, remaining: 0 });
    expect(mailer.sent).toHaveLength(2);
    // The bounced address from the SES suppression list was switched off.
    expect((await client.query(`select status from public.subscribers where email = 'bounced@example.com'`)).rows[0].status).toBe('bounced');
  });

  test('live mode reaches every confirmed subscriber; dry run and test sends touch nothing', async () => {
    await client.query(`insert into public.subscribers (email, status, confirmed_at) values ('live.reader@example.com', 'confirmed', now())`);
    const { deps: dry } = makeDeps({ EMAIL_MODE: 'live' });
    expect(await (await handleDaily(cron('?dry=1'), dry)).json()).toMatchObject({ dryRun: true, recipients: 1 });

    const { deps: test, mailer: testMailer } = makeDeps();
    expect(await (await handleDaily(cron('?test=1'), test)).json()).toMatchObject({ test: true, sent: [OWNER, 'friend@example.com'] });
    expect(testMailer.sent).toHaveLength(2);

    const { deps: live, mailer } = makeDeps({ EMAIL_MODE: 'live' });
    expect(await (await handleDaily(cron(), live)).json()).toMatchObject({ sent: 1, remaining: 0 });
    expect(mailer.sent.map((m) => m.to)).toEqual(['live.reader@example.com']);
  });
  test('“A pearl to revisit” goes only to subscribers with an account and a due word', async () => {
    clock = new Date('2026-10-07T05:20:00Z');
    const date = '2026-10-07';
    const today = pearlForDate(date, words as EmailWord[]);
    const [a, b] = (words as EmailWord[]).filter((w) => w.slug !== today);
    const reader = '5b1f2c3d-0000-4000-8000-000000000001';
    const early = '5b1f2c3d-0000-4000-8000-000000000002';
    await client.query(`insert into auth.users (id, email) values ($1, 'member@example.com'), ($2, 'early@example.com')`, [reader, early]);
    await client.query(
      `insert into public.subscribers (email, status, confirmed_at, user_id) values
         ('member@example.com', 'confirmed', now(), $1), ('early@example.com', 'confirmed', now(), $2), ('guest@example.com', 'confirmed', now(), null)`,
      [reader, early],
    );
    await client.query(
      `insert into public.word_progress (user_id, word_slug, box, due_at, last_reviewed_at) values
         ($1, 'retired-word', 1, $3::timestamptz - interval '9 days', $3::timestamptz - interval '10 days'),
         ($1, $4, 3, $3::timestamptz - interval '2 days', $3::timestamptz - interval '9 days'),
         ($1, $5, 1, $3::timestamptz - interval '2 days', $3::timestamptz - interval '3 days'),
         ($1, $6, 1, $3::timestamptz - interval '5 days', $3::timestamptz - interval '6 days'),
         ($2, $4, 2, $3::timestamptz + interval '1 day', $3::timestamptz - interval '2 days')`,
      [reader, early, clock.toISOString(), a.slug, b.slug, today],
    );
    const { deps, mailer } = makeDeps({ EMAIL_MODE: 'live' });
    expect(await (await handleDaily(cron(), deps)).json()).toMatchObject({ date, failed: 0, remaining: 0 });
    const to = (email: string) => mailer.sent.find((m) => m.to === email)!;
    // Most overdue first, but never a retired word and never today's own pearl; then the lowest box.
    expect(to('member@example.com').html).toContain('A pearl to revisit:');
    expect(to('member@example.com').html).toContain(`href="${SITE}/word/${b.slug}"`);
    expect(to('member@example.com').text).toContain(`A pearl to revisit: ${b.ar} (${b.translit}) — ${b.meanings[0]}: ${SITE}/word/${b.slug}`);
    // Nothing due yet, or no account: the email is unchanged.
    expect(to('early@example.com').html).not.toContain('A pearl to revisit');
    expect(to('guest@example.com').html).not.toContain('A pearl to revisit');
  });

  test('Reply-To goes on every email when EMAIL_REPLY_TO is set, and only then', async () => {
    const { deps, mailer } = makeDeps({ EMAIL_REPLY_TO: 'Durar <hello@durar.example>' });
    await handleDaily(cron('?test=1'), deps);
    expect(mailer.sent[0].replyTo).toBe('Durar <hello@durar.example>');
    expect(buildMime(mailer.sent[0])).toContain('\r\nReply-To: Durar <hello@durar.example>\r\n');
    const { deps: plain, mailer: plainMailer } = makeDeps();
    await handleDaily(cron('?test=1'), plain);
    expect(buildMime(plainMailer.sent[0])).not.toContain('Reply-To:');
  });

  test('each run is logged, and the 08:15 health check stays quiet on a good day', async () => {
    const { rows } = await client.query(`select status, sent, failed, remaining from public.daily_runs where run_date = '2026-10-01'`);
    expect(rows[0]).toMatchObject({ status: 'complete', sent: 3, failed: 0, remaining: 0 });
    const { deps, mailer } = makeDeps();
    expect((await handleHealth(health('', 'Bearer wrong'), deps)).status).toBe(401);
    clock = new Date('2026-10-01T05:15:00Z'); // 07:15 Amsterdam: not the check's hour
    expect(await (await handleHealth(health(), deps)).json()).toMatchObject({ skipped: 'outside_check_window' });
    clock = new Date('2026-10-01T06:15:00Z'); // 08:15 Amsterdam
    expect(await (await handleHealth(health(), deps)).json()).toMatchObject({ date: '2026-10-01', ok: true, problems: [], alerted: false });
    expect(mailer.sent).toHaveLength(0);
  });

  test('a morning with no run emails the owner (dry=1 only reports)', async () => {
    clock = new Date('2026-10-02T06:15:00Z');
    const { deps, mailer } = makeDeps();
    expect(await (await handleHealth(health('?dry=1'), deps)).json()).toMatchObject({ ok: false, alerted: false });
    expect(mailer.sent).toHaveLength(0);
    const res = await (await handleHealth(health(), deps)).json();
    expect(res).toMatchObject({ date: '2026-10-02', ok: false, alerted: true });
    expect(res.problems[0]).toMatch(/No run was recorded/);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: OWNER, subject: 'Durar: the 2026-10-02 email needs a look' });
  });

  test('failed sends are logged and reported to ALERT_EMAIL', async () => {
    clock = new Date('2026-10-03T05:15:00Z');
    const { deps } = makeDeps();
    deps.mailer = { name: 'broken', send: async () => Promise.reject(new Error('SES said no')) };
    expect(await (await handleDaily(cron(), deps)).json()).toMatchObject({ sent: 0, failed: 2, remaining: 0, status: 'had_failures' });
    clock = new Date('2026-10-03T06:15:00Z');
    const { deps: check, mailer } = makeDeps({ ALERT_EMAIL: 'alerts@example.com' });
    const res = await (await handleHealth(health(), check)).json();
    expect(res).toMatchObject({ ok: false, alerted: true, problems: ['2 send(s) failed.'] });
    expect(mailer.sent[0].to).toBe('alerts@example.com');
    expect(mailer.sent[0].text).toContain('2 send(s) failed.');
    clock = new Date('2026-10-01T05:15:00Z');
  });
});
