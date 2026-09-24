/**
 * HTTP handlers for Pearl of the Day email, written against the standard Request/Response API so
 * they run unchanged on Vercel and in tests. Dependencies are injected (see deps.ts).
 */
import { amsterdamDate, amsterdamHour, pearlForDate } from '../shared/pearlOfTheDay.js';
import type { Config } from './config.js';
import type { EmailMessage, EmailSender } from './email/types.js';
import { renderConfirmation, renderDaily, type EmailWord } from './email/templates.js';
import type { Store } from './store.js';
import { ipHash, randomToken, sha256, unsubscribeToken, verifyUnsubscribeToken } from './tokens.js';

export interface AccountUser {
  id: string;
  email: string | null;
  /** True when the address was verified by the identity provider (e.g. Google). */
  emailVerifiedByProvider: boolean;
}

export interface Deps {
  config: Config;
  store: Store;
  mailer: EmailSender;
  words: EmailWord[];
  /** Resolves a Supabase access token to its user, or null. */
  verifyUser(accessToken: string): Promise<AccountUser | null>;
  now(): Date;
  sleep(ms: number): Promise<void>;
  log(...args: unknown[]): void;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

async function readBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) return ((await req.json()) ?? {}) as Record<string, string>;
    const text = await req.text();
    return Object.fromEntries(new URLSearchParams(text));
  } catch {
    return {};
  }
}

/** In sandbox mode only allow-listed recipients are ever emailed. */
export function mayEmail(config: Config, to: string): boolean {
  if (config.emailMode === 'dry-run') return false;
  if (config.emailMode === 'sandbox') return config.sandboxTo.includes(to.toLowerCase());
  return true;
}

function unsubscribeLinks(config: Config, subscriberId: string) {
  const token = unsubscribeToken(subscriberId, config.tokenSecret);
  return {
    page: `${config.siteUrl}/unsubscribe?token=${encodeURIComponent(token)}`,
    // RFC 8058 one-click: mail apps POST “List-Unsubscribe=One-Click” to this URL.
    oneClick: `${config.siteUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`,
  };
}

function listUnsubscribeHeaders(oneClick: string): Record<string, string> {
  return { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

// ---------------------------------------------------------------------------------------------
// POST /api/subscribe  { email, website? }   (website is a honeypot: humans never fill it)

export async function handleSubscribe(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  const { config, store } = deps;
  const body = await readBody(req);
  // Every anonymous caller gets the same answer, whether or not the address is already known.
  const generic = json(200, { ok: true, status: 'check_inbox' });

  if (body.website) {
    deps.log('subscribe: honeypot filled, ignoring');
    return generic;
  }
  const email = normalizeEmail(body.email);
  if (!email) return json(400, { error: 'invalid_email' });

  // Signed in with the same address? Link the account; skip opt-in if the provider verified it.
  let user: AccountUser | null = null;
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) user = await deps.verifyUser(auth.slice(7)).catch(() => null);
  const own = user && user.email?.toLowerCase() === email ? user : null;

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const token = randomToken();
  const { outcome, subscriberId } = await store.request({
    email,
    ipHash: own ? null : ipHash(ip, config.tokenSecret),
    userId: own?.id ?? null,
    verified: !!own?.emailVerifiedByProvider,
    tokenHash: sha256(token),
  });

  if (outcome === 'rate_limited') return json(429, { error: 'rate_limited' }, { 'Retry-After': '3600' });

  if (outcome === 'send_confirmation' && subscriberId) {
    if (mayEmail(config, email)) {
      const links = unsubscribeLinks(config, subscriberId);
      const confirmUrl = `${config.siteUrl}/subscribe/confirm?token=${encodeURIComponent(token)}`;
      const r = renderConfirmation({ confirmUrl, siteUrl: config.siteUrl, unsubscribeUrl: links.page, contactEmail: config.contactEmail });
      try {
        await deps.mailer.send({ to: email, from: config.from, ...r, headers: listUnsubscribeHeaders(links.oneClick) });
      } catch (e) {
        deps.log('subscribe: confirmation email failed', e);
      }
    } else {
      deps.log(`subscribe: ${config.emailMode} mode, not emailing a non-allow-listed address`);
    }
  }

  // Account holders asking about their own address may learn its state.
  if (own) return json(200, { ok: true, status: outcome === 'confirmed' ? 'confirmed' : 'check_inbox' });
  return generic;
}

// ---------------------------------------------------------------------------------------------
// POST /api/confirm  { token }

export async function handleConfirm(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  const { token } = await readBody(req);
  if (!token || typeof token !== 'string' || token.length > 200) return json(400, { status: 'invalid' });
  const status = await deps.store.confirm(sha256(token));
  return json(status === 'confirmed' || status === 'already_confirmed' ? 200 : 400, { status });
}

// ---------------------------------------------------------------------------------------------
// POST /api/unsubscribe?token=…            one-click (RFC 8058) or from the unsubscribe page
// POST /api/unsubscribe  { token, action: "resubscribe" }

export async function handleUnsubscribe(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  const url = new URL(req.url);
  const body = await readBody(req);
  const token = url.searchParams.get('token') ?? body.token ?? '';
  const id = verifyUnsubscribeToken(token, deps.config.tokenSecret);
  if (!id) return json(400, { status: 'invalid' });
  if (body.action === 'resubscribe') return json(200, { status: await deps.store.resubscribe(id) });
  const status = await deps.store.unsubscribe(id);
  return json(200, { status: status === 'unknown' ? 'unsubscribed' : status });
}

// ---------------------------------------------------------------------------------------------
// GET /api/cron/daily   (Authorization: Bearer $CRON_SECRET)
//   ?dry=1   count recipients and render, send nothing
//   ?test=1  send today's email to the sandbox address(es) only, outside the log
//   ?force=1 ignore the 07:00 window

const BATCH = 10;
const TIME_BUDGET_MS = 45_000;

export async function handleDaily(req: Request, deps: Deps): Promise<Response> {
  const { config, store, mailer } = deps;
  if (!config.cronSecret || req.headers.get('authorization') !== `Bearer ${config.cronSecret}`) {
    return json(401, { error: 'unauthorized' });
  }
  const url = new URL(req.url);
  const flag = (k: string) => url.searchParams.get(k) === '1';
  const now = deps.now();
  const started = Date.now();

  // The scheduler calls every 10 minutes around the window; only the Amsterdam 07:xx calls send.
  if (!flag('force') && !flag('test') && !flag('dry') && amsterdamHour(now) !== config.sendHour) {
    return json(200, { skipped: 'outside_send_window', amsterdamHour: amsterdamHour(now) });
  }

  const date = amsterdamDate(now);
  const slug = pearlForDate(date, deps.words);
  const word = deps.words.find((w) => w.slug === slug)!;
  const only = config.emailMode === 'live' ? null : config.sandboxTo;

  const housekeeping = await store.housekeeping();
  let suppressed = 0;
  if (mailer.listSuppressed && config.emailMode !== 'dry-run') {
    try {
      for (const s of await mailer.listSuppressed(new Date(now.getTime() - 3 * 86_400_000))) {
        if (await store.suppress(s.email, s.reason)) suppressed++;
      }
    } catch (e) {
      deps.log('daily: could not read the suppression list (needs ses:ListSuppressedDestinations)', e);
    }
  }

  const build = (to: string, subscriberId: string): EmailMessage => {
    const links = unsubscribeLinks(config, subscriberId);
    const r = renderDaily({
      word,
      date,
      siteUrl: config.siteUrl,
      unsubscribeUrl: links.page,
      contactEmail: config.contactEmail,
      subjectStyle: config.subjectStyle,
    });
    return { to, from: config.from, ...r, headers: listUnsubscribeHeaders(links.oneClick) };
  };

  if (flag('test')) {
    // A preview for the owner: not logged, so it never blocks the real send.
    const sent: string[] = [];
    for (const to of config.sandboxTo) {
      await mailer.send(build(to, '00000000-0000-4000-8000-000000000000'));
      sent.push(to);
    }
    return json(200, { date, slug, test: true, sent });
  }

  if (flag('dry') || config.emailMode === 'dry-run') {
    const recipients = await store.pendingCount(date, only);
    const preview = build('reader@example.com', '00000000-0000-4000-8000-000000000000');
    return json(200, { date, slug, dryRun: true, mode: config.emailMode, recipients, subject: preview.subject, housekeeping, suppressed });
  }

  const gap = 1000 / config.ratePerSecond;
  let sent = 0;
  let failed = 0;
  while (Date.now() - started < TIME_BUDGET_MS) {
    const batch = await store.claim(date, slug, BATCH, only);
    if (!batch.length) break;
    for (const r of batch) {
      const t0 = Date.now();
      try {
        const { messageId } = await mailer.send(build(r.email, r.subscriberId));
        await store.mark(r.subscriberId, date, 'sent', messageId);
        sent++;
      } catch (e) {
        failed++;
        deps.log(`daily: send failed for subscriber ${r.subscriberId}`, e);
        await store.mark(r.subscriberId, date, 'failed');
      }
      const wait = gap - (Date.now() - t0);
      if (wait > 0) await deps.sleep(wait);
    }
  }
  const remaining = await store.pendingCount(date, only);
  return json(200, { date, slug, mode: config.emailMode, sent, failed, remaining, housekeeping, suppressed });
}
