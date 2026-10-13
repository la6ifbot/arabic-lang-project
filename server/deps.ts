import { loadConfig } from './config.js';
import { memorySender } from './email/memory.js';
import { sesSender } from './email/ses.js';
import type { EmailSender } from './email/types.js';
import type { AccountUser, Deps } from './handlers.js';
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
    async verifyTurnstile(token, ip) {
      const form = new URLSearchParams({ secret: config.turnstileSecret ?? '', response: token });
      if (ip) form.set('remoteip', ip);
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return false;
      const out = (await res.json()) as { success?: boolean };
      return out.success === true;
    },
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (...args) => console.log(...args),
  };
}

/** Wraps a handler for Vercel's Node.js runtime (Web Request/Response signature). */
export function route(handler: (req: Request, deps: Deps) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req, productionDeps());
    } catch (e) {
      console.error(e);
      return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  };
}
