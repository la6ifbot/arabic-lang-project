import { loadConfig } from './config.js';
import { memorySender } from './email/memory.js';
import { sesSender } from './email/ses.js';
import type { EmailSender } from './email/types.js';
import { reportError, type AccountUser, type Deps } from './handlers.js';
import { restStore } from './store.js';
import { WORDS } from './words.js';

/** Wires the handlers to Supabase and SES from environment variables. */
export function productionDeps(env: Record<string, string | undefined> = process.env): Deps {
  const config = loadConfig(env);
  if (!config.supabaseUrl || !config.serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  if (!config.tokenSecret || config.tokenSecret.length < 32) throw new Error('EMAIL_TOKEN_SECRET must be set (32+ characters)');

  let mailer: EmailSender;
  if (config.emailMode === 'dry-run' || !config.ses.accessKeyId || !config.ses.secretAccessKey) {
    mailer = memorySender();
    if (config.emailMode !== 'dry-run') console.warn('email: SES keys missing, emails are not sent');
  } else {
    mailer = sesSender({ region: config.ses.region, accessKeyId: config.ses.accessKeyId, secretAccessKey: config.ses.secretAccessKey });
  }

  const { supabaseUrl, serviceKey } = config;
  return {
    config,
    store: restStore(supabaseUrl, serviceKey),
    mailer,
    words: WORDS,
    async verifyUser(accessToken): Promise<AccountUser | null> {
      const res = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return null;
      const u = (await res.json()) as {
        id: string;
        email?: string;
        app_metadata?: { provider?: string; providers?: string[] };
        identities?: { provider: string }[];
      };
      const providers = [u.app_metadata?.provider, ...(u.app_metadata?.providers ?? []), ...(u.identities ?? []).map((i) => i.provider)];
      // Google verifies the address; with “Confirm email” off, Supabase's own flag proves nothing.
      return { id: u.id, email: u.email ?? null, emailVerifiedByProvider: providers.includes('google') };
    },
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (...args) => console.log(...args),
  };
}

/**
 * Wraps a handler for Vercel's Node.js runtime (Web Request/Response signature). An unexpected
 * failure answers 500 and is recorded, scrubbed, in the error log under `source`.
 */
export function route(handler: (req: Request, deps: Deps) => Promise<Response>, source: string) {
  return async (req: Request): Promise<Response> => {
    let deps: Deps | null = null;
    try {
      deps = productionDeps();
      return await handler(req, deps);
    } catch (e) {
      if (deps) await reportError(deps, source, e);
      else console.error(e);
      return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  };
}

/** /api/health: missing settings or any failure is simply “not ok”, with no details in public. */
export function healthRoute(handler: (req: Request, deps: Deps) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req, productionDeps());
    } catch (e) {
      console.error('health:', e instanceof Error ? e.message : e);
      return new Response(req.method === 'HEAD' ? null : JSON.stringify({ ok: false }), {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
  };
}
