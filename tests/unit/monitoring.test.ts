/**
 * Monitoring (Phase 0.7): /api/health, the error log's scrubbing, and the weekly digest. The
 * handlers run against a small in-memory store; the SQL behind it is covered in tests/db/monitoring.
 */
import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../server/config';
import { BACKUP_STALE_MS, digestSections, jobLine, renderDigest } from '../../server/email/digest';
import { memorySender } from '../../server/email/memory';
import { describeError, scrub } from '../../server/errors';
import { handlePublicHealth, handleWeekly, lastWeek, missingEmailSettings, mondayOf, type Deps } from '../../server/handlers';
import type { OpsCheck, Store, WeeklyStats } from '../../server/store';

const SITE = 'https://durar.example';
const ENV = {
  SITE_URL: SITE,
  EMAIL_MODE: 'live',
  EMAIL_SANDBOX_TO: 'owner@example.org',
  EMAIL_FROM: 'Durar <pearl@durar.example>',
  EMAIL_TOKEN_SECRET: 'x'.repeat(40),
  CRON_SECRET: 'cron-secret',
  SES_ACCESS_KEY_ID: 'AKIATEST',
  SES_SECRET_ACCESS_KEY: 'test',
};

const stats = (over: Partial<WeeklyStats> = {}): WeeklyStats => ({
  from: '2026-10-19',
  to: '2026-10-26',
  subscribers: { total: 12, new: 3, unsubscribed: 1, pending: 2 },
  emails: { sent: 80, failed: 0, bounces: 0, complaints: 0, days_complete: 7, days_with_problems: 0 },
  accounts: { total: 9, new: 2 },
  reviews: { words: 140, people: 4 },
  deep: null,
  errors: { total: 0, by_source: {} },
  ops: {},
  ...over,
});

function fakeStore(opts: { ping?: () => Promise<boolean>; stats?: WeeklyStats } = {}) {
  const errors: { source: string; code: string | null; message: string }[] = [];
  const ops: Record<string, OpsCheck> = {};
  const store = {
    ping: opts.ping ?? (async () => true),
    async logError(source: string, code: string | null, message: string) {
      errors.push({ source, code, message });
    },
    async opsReport(name: string, ok: boolean, detail: Record<string, unknown> = {}) {
      const now = new Date().toISOString();
      ops[name] = { last_ok: ok, last_run_at: now, last_ok_at: ok ? now : (ops[name]?.last_ok_at ?? null), detail };
    },
    async opsStatus() {
      return ops;
    },
    async weeklyStats() {
      return { ...(opts.stats ?? stats()), ops: { ...ops } };
    },
  } as unknown as Store;
  return { store, errors, ops };
}

function makeDeps(env: Record<string, string> = {}, store = fakeStore(), now = new Date('2026-10-26T07:05:00Z')) {
  const mailer = memorySender();
  const deps: Deps = {
    config: loadConfig({ ...ENV, ...env }),
    store: store.store,
    mailer,
    words: [],
    verifyUser: async () => null,
    now: () => now,
    sleep: async () => {},
    log: () => {},
  };
  return { deps, mailer, ...store };
}

const get = (path: string, auth?: string, method = 'GET') =>
  new Request(`${SITE}${path}`, { method, headers: auth ? { authorization: auth } : {} });

describe('/api/health', () => {
  test('200 {"ok":true} when the database answers and the email settings are present', async () => {
    const { deps } = makeDeps();
    const res = await handlePublicHealth(get('/api/health'), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true });
  });

  test('HEAD works too, with no body', async () => {
    const { deps } = makeDeps();
    const res = await handlePublicHealth(get('/api/health', undefined, 'HEAD'), deps);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  test('a database failure is 503 {"ok":false}, with no details', async () => {
    const { deps } = makeDeps({}, fakeStore({ ping: async () => Promise.reject(new Error('connection refused to db.internal:5432')) }));
    const res = await handlePublicHealth(get('/api/health'), deps);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"ok":false}');
  });

  test('missing email settings are 503, and the error log names them (never their values)', async () => {
    const s = fakeStore();
    const { deps } = makeDeps({ SES_ACCESS_KEY_ID: '' }, s);
    const res = await handlePublicHealth(get('/api/health'), deps);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
    expect(s.errors).toEqual([{ source: 'health', code: 'Error', message: 'missing SES keys' }]);
  });

  test('dry-run mode needs no SES keys; the placeholder sender address counts as missing', () => {
    expect(missingEmailSettings(loadConfig({ ...ENV, EMAIL_MODE: 'dry-run', SES_ACCESS_KEY_ID: '' }))).toEqual([]);
    expect(missingEmailSettings(loadConfig({ ...ENV, EMAIL_FROM: '' }))).toEqual(['EMAIL_FROM']);
    expect(missingEmailSettings(loadConfig({ ...ENV, CRON_SECRET: '' }))).toEqual(['CRON_SECRET']);
  });

  test('only GET and HEAD', async () => {
    const { deps } = makeDeps();
    expect((await handlePublicHealth(get('/api/health', undefined, 'POST'), deps)).status).toBe(405);
  });
});

describe('error log scrubbing', () => {
  test('removes addresses, ids, IP addresses and secrets', () => {
    const out = scrub(
      'send to reader@example.com (subscriber 1b4e28ba-2fa1-11d2-883f-0016d3cca427) from 203.0.113.9 failed: token=abc123 key: AKIAIOSFODNN7EXAMPLEEXAMPLE1234567 Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
    );
    expect(out).not.toMatch(/reader|1b4e28ba|203\.0|abc123|AKIA|eyJ/);
    expect(out).toContain('[email]');
    expect(out).toContain('[id]');
    expect(out).toContain('[ip]');
  });

  test('keeps the useful part and cuts long messages to 300 characters', () => {
    expect(scrub('Supabase daily_claim failed: 503 upstream timeout')).toBe('Supabase daily_claim failed: 503 upstream timeout');
    expect(scrub('x '.repeat(400)).length).toBeLessThanOrEqual(300);
    expect(describeError(Object.assign(new Error('Throttling: rate exceeded'), { name: 'ThrottlingException' }))).toEqual({
      code: 'ThrottlingException',
      message: 'Throttling: rate exceeded',
    });
  });
});

describe('weekly window', () => {
  test('mondayOf and lastWeek follow Amsterdam days, across the end of summer time', () => {
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
    expect(mondayOf('2026-10-20')).toBe('2026-10-19');
    // Monday 26 Oct 08:05 CET is 07:05 UTC; last week ran Monday 19 to Sunday 25 (DST ended on the 25th).
    expect(lastWeek(new Date('2026-10-26T07:05:00Z'))).toEqual({ from: '2026-10-19', to: '2026-10-26' });
    // Sunday 23:30 UTC is already Monday in Amsterdam (summer time).
    expect(lastWeek(new Date('2026-10-04T22:30:00Z'))).toEqual({ from: '2026-09-28', to: '2026-10-05' });
  });
});

describe('/api/cron/weekly', () => {
  const MONDAY_0805 = new Date('2026-10-26T07:05:00Z'); // 08:05 CET
  const MONDAY_0705 = new Date('2026-10-26T06:05:00Z'); // 07:05 CET

  test('needs the cron secret', async () => {
    const { deps } = makeDeps();
    expect((await handleWeekly(get('/api/cron/weekly'), deps)).status).toBe(401);
    expect((await handleWeekly(get('/api/cron/weekly', 'Bearer wrong'), deps)).status).toBe(401);
  });

  test('only the Monday 08:xx Amsterdam call sends', async () => {
    const early = makeDeps({}, fakeStore(), MONDAY_0705);
    expect(await (await handleWeekly(get('/api/cron/weekly', 'Bearer cron-secret'), early.deps)).json()).toMatchObject({ skipped: 'outside_digest_window' });
    const tuesday = makeDeps({}, fakeStore(), new Date('2026-10-27T07:05:00Z'));
    expect(await (await handleWeekly(get('/api/cron/weekly', 'Bearer cron-secret'), tuesday.deps)).json()).toMatchObject({ skipped: 'outside_digest_window' });
    expect(early.mailer.sent.length + tuesday.mailer.sent.length).toBe(0);
  });

  test('sends once a week to the owner, then skips a second call for the same week', async () => {
    const { deps, mailer, ops } = makeDeps({ ALERT_EMAIL: 'alerts@example.org' }, fakeStore(), MONDAY_0805);
    const first = await handleWeekly(get('/api/cron/weekly', 'Bearer cron-secret'), deps);
    expect(await first.json()).toEqual({ week: { from: '2026-10-19', to: '2026-10-26' }, sent: true });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe('alerts@example.org');
    expect(ops.weekly_digest).toMatchObject({ last_ok: true, detail: { week: '2026-10-19' } });

    const again = await handleWeekly(get('/api/cron/weekly', 'Bearer cron-secret'), deps);
    expect(await again.json()).toMatchObject({ skipped: 'already_sent' });
    const forced = await handleWeekly(get('/api/cron/weekly?force=1', 'Bearer cron-secret'), deps);
    expect(await forced.json()).toMatchObject({ sent: true });
    expect(mailer.sent).toHaveLength(2);
  });

  test('?dry=1 returns the numbers and sends nothing', async () => {
    const { deps, mailer } = makeDeps({}, fakeStore(), new Date('2026-10-28T12:00:00Z'));
    const body = await (await handleWeekly(get('/api/cron/weekly?dry=1', 'Bearer cron-secret'), deps)).json();
    expect(body).toMatchObject({ dryRun: true, week: { from: '2026-10-19' }, stats: { subscribers: { total: 12 } } });
    expect(mailer.sent).toHaveLength(0);
  });

  test('a failed send is logged and reported', async () => {
    const s = fakeStore();
    const { deps, mailer } = makeDeps({}, s, MONDAY_0805);
    mailer.send = async () => {
      throw new Error('SES rejected pearl@durar.example');
    };
    const res = await handleWeekly(get('/api/cron/weekly', 'Bearer cron-secret'), deps);
    expect(res.status).toBe(502);
    expect(s.errors).toEqual([{ source: 'weekly:email', code: 'Error', message: 'SES rejected [email]' }]);
    expect(s.ops.weekly_digest.last_ok).toBe(false);
  });
});

describe('the digest email', () => {
  const now = new Date('2026-10-26T07:05:00Z');
  const ok = (hoursAgo: number): OpsCheck => ({
    last_ok: true,
    last_run_at: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
    last_ok_at: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
    detail: {},
  });

  test('has every line from the checklist, in HTML and plain text, and says “All quiet” when it is', () => {
    const r = renderDigest({ stats: stats({ ops: { backup: ok(5), restore_test: ok(24 * 10) } }), siteUrl: SITE, now });
    for (const label of ['Subscribers', 'Emails sent', 'Bounces · complaints', 'Accounts', 'Reviews', 'The Deep', 'Nightly backup', 'Restore test', 'Errors']) {
      expect(r.text).toContain(label);
      expect(r.html).toContain(label);
    }
    expect(r.text).toContain('All quiet.');
    expect(r.text).toContain('The Deep: not live yet');
    expect(r.text).toContain('Monday 19 October to Sunday 25 October');
    expect(r.subject).toBe('Durar this week: 12 subscribers, 9 accounts');
  });

  test('flags failures, stale backups and errors, and puts “needs a look” in the subject', () => {
    const failed: OpsCheck = { ...ok(30), last_ok: false };
    const r = renderDigest({
      stats: stats({ errors: { total: 3, by_source: { 'daily:send': 2, subscribe: 1 } }, emails: { ...stats().emails, complaints: 1 }, ops: { backup: failed } }),
      siteUrl: SITE,
      now,
    });
    expect(r.subject).toContain('needs a look');
    expect(r.text).toContain('Needs a look: Bounces · complaints, Nightly backup, Errors.');
    expect(r.text).toContain('Errors: 3 (daily:send 2, subscribe 1)');
    expect(r.text).toContain('Restore test: not reported yet');
  });

  test('a backup older than 30 hours is flagged; The Deep shows its divers once live', () => {
    expect(jobLine(ok(BACKUP_STALE_MS / 3_600_000 + 1), BACKUP_STALE_MS, now).warn).toBe(true);
    expect(jobLine(ok(20), BACKUP_STALE_MS, now).warn).toBe(false);
    const rows = digestSections(stats({ deep: { participants: 1 } }), now).flatMap((s) => s.rows);
    expect(rows.find((r) => r[0] === 'The Deep')![1]).toBe('1 diver');
  });

  test('contains aggregate numbers only: no addresses', () => {
    const r = renderDigest({ stats: stats(), siteUrl: SITE, now });
    expect(r.text + r.html).not.toMatch(/[\w.-]+@[\w-]+\.\w+/);
  });
});
