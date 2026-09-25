/**
 * Subscription storage. All logic lives in SQL functions (supabase/migrations), called here either
 * through Supabase's REST API with the service role (production) or over a direct PostgreSQL
 * connection (tests), so both paths run exactly the same code.
 */
export type RequestOutcome = 'rate_limited' | 'send_confirmation' | 'confirmed' | 'noop';

export type RunStatus = 'complete' | 'had_failures' | 'incomplete' | 'error';

/** One daily call's numbers; the database adds them to the day's row (see daily_run_record). */
export interface RunRecord {
  date: string;
  slug: string;
  mode: string;
  claimed: number;
  sent: number;
  failed: number;
  /** Null when the call failed before it could count. */
  remaining: number | null;
  error?: string | null;
}

export interface DayHealth {
  run: {
    run_date: string;
    status: RunStatus;
    claimed: number;
    sent: number;
    failed: number;
    remaining: number | null;
    invocations: number;
    last_error: string | null;
    finished_at: string;
  } | null;
  sends: { sent: number; failed: number; reserved: number };
}

export interface Store {
  request(p: { email: string; ipHash: string | null; userId: string | null; verified: boolean; tokenHash: string }): Promise<{
    outcome: RequestOutcome;
    subscriberId: string | null;
  }>;
  confirm(tokenHash: string): Promise<'confirmed' | 'already_confirmed' | 'expired' | 'invalid'>;
  unsubscribe(id: string): Promise<'unsubscribed' | 'unknown'>;
  resubscribe(id: string): Promise<'confirmed' | 'blocked' | 'unknown'>;
  claim(date: string, slug: string, limit: number, only: string[] | null): Promise<{ subscriberId: string; email: string }[]>;
  pendingCount(date: string, only: string[] | null): Promise<number>;
  mark(subscriberId: string, date: string, status: 'sent' | 'failed', messageId?: string | null): Promise<void>;
  suppress(email: string, reason: 'bounce' | 'complaint'): Promise<boolean>;
  housekeeping(): Promise<Record<string, number>>;
  recordRun(r: RunRecord): Promise<RunStatus>;
  health(date: string): Promise<DayHealth>;
}

type Call = (fn: string, args: Record<string, unknown>, returnsSet: boolean) => Promise<unknown>;

function storeFrom(call: Call): Store {
  return {
    async request(p) {
      const rows = (await call(
        'subscription_request',
        { p_email: p.email, p_ip_hash: p.ipHash, p_user_id: p.userId, p_verified: p.verified, p_token_hash: p.tokenHash },
        true,
      )) as { outcome: RequestOutcome; subscriber_id: string | null }[];
      return { outcome: rows[0].outcome, subscriberId: rows[0].subscriber_id };
    },
    confirm: async (h) => (await call('subscription_confirm', { p_token_hash: h }, false)) as Awaited<ReturnType<Store['confirm']>>,
    unsubscribe: async (id) => (await call('subscription_unsubscribe', { p_id: id }, false)) as Awaited<ReturnType<Store['unsubscribe']>>,
    resubscribe: async (id) => (await call('subscription_resubscribe', { p_id: id }, false)) as Awaited<ReturnType<Store['resubscribe']>>,
    async claim(date, slug, limit, only) {
      const rows = (await call('daily_claim', { p_date: date, p_slug: slug, p_limit: limit, p_only: only }, true)) as {
        subscriber_id: string;
        email: string;
      }[];
      return rows.map((r) => ({ subscriberId: r.subscriber_id, email: r.email }));
    },
    pendingCount: async (date, only) => Number(await call('daily_pending_count', { p_date: date, p_only: only }, false)),
    async mark(subscriberId, date, status, messageId = null) {
      await call('daily_mark', { p_subscriber_id: subscriberId, p_date: date, p_status: status, p_message_id: messageId }, false);
    },
    suppress: async (email, reason) => Boolean(await call('subscription_suppress', { p_email: email, p_reason: reason }, false)),
    housekeeping: async () => (await call('subscriptions_housekeeping', {}, false)) as Record<string, number>,
    recordRun: async (r) =>
      (await call(
        'daily_run_record',
        {
          p_date: r.date,
          p_slug: r.slug,
          p_mode: r.mode,
          p_claimed: r.claimed,
          p_sent: r.sent,
          p_failed: r.failed,
          p_remaining: r.remaining,
          p_error: r.error ?? null,
        },
        false,
      )) as RunStatus,
    async health(date) {
      const h = (await call('daily_health', { p_date: date }, false)) as DayHealth;
      const n = (v: unknown) => Number(v ?? 0);
      return { run: h.run, sends: { sent: n(h.sends.sent), failed: n(h.sends.failed), reserved: n(h.sends.reserved) } };
    },
  };
}

/** Production: Supabase REST (PostgREST) with the service-role key. */
export function restStore(supabaseUrl: string, serviceKey: string, fetchImpl: typeof fetch = fetch): Store {
  return storeFrom(async (fn, args) => {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Supabase ${fn} failed: ${res.status} ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  });
}

interface PgLike {
  query(sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Tests and scripts: a direct PostgreSQL connection (e.g. `pg.Client`). */
export function pgStore(client: PgLike): Store {
  return storeFrom(async (fn, args, returnsSet) => {
    const names = Object.keys(args);
    const params = names.map((n) => args[n]);
    const call = `public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`;
    if (returnsSet) return (await client.query(`select * from ${call}`, params)).rows;
    return (await client.query(`select ${call} as v`, params)).rows[0]?.v ?? null;
  });
}
