/**
 * Server-side configuration, read from environment variables (Vercel → Settings → Environment
 * Variables). None of these may start with VITE_: that prefix would ship them to the browser.
 */
export type EmailMode = 'sandbox' | 'live' | 'dry-run';

export interface Config {
  siteUrl: string;
  contactEmail: string | null;
  /** sandbox: only addresses in sandboxTo are emailed. live: everyone. dry-run: nothing is sent. */
  emailMode: EmailMode;
  sandboxTo: string[];
  from: string;
  /** Where replies go (Reply-To), e.g. hello@durar.space. Null: replies go to the sender. */
  replyTo: string | null;
  /** Who the morning health check emails when something went wrong. */
  alertTo: string | null;
  subjectStyle: 'a' | 'b' | 'c';
  tokenSecret: string;
  cronSecret: string | null;
  /** Cloudflare Turnstile secret. Set: /api/subscribe requires a valid token from anyone not signed in. */
  turnstileSecret: string | null;
  /** Amsterdam hour in which the daily email goes out. */
  sendHour: number;
  /** Amsterdam hour in which the health check looks at today's run. */
  healthHour: number;
  /** SES sending rate (emails per second); 1 in the SES sandbox. */
  ratePerSecond: number;
  supabaseUrl: string | null;
  serviceKey: string | null;
  ses: { region: string; accessKeyId: string | null; secretAccessKey: string | null };
}

const list = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function siteUrlFrom(env: Record<string, string | undefined>): string {
  const raw = env.SITE_URL || env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || 'http://localhost:5173';
  return (/^https?:\/\//.test(raw) ? raw : `https://${raw}`).replace(/\/$/, '');
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const mode = (env.EMAIL_MODE ?? 'sandbox').toLowerCase();
  const style = (env.EMAIL_SUBJECT_STYLE ?? 'b').toLowerCase();
  return {
    siteUrl: siteUrlFrom(env),
    contactEmail: env.CONTACT_EMAIL || env.VITE_CONTACT_EMAIL || null,
    emailMode: mode === 'live' || mode === 'dry-run' ? mode : 'sandbox',
    sandboxTo: list(env.EMAIL_SANDBOX_TO),
    from: env.EMAIL_FROM || 'Durar <no-reply@example.com>',
    replyTo: env.EMAIL_REPLY_TO || null,
    alertTo: env.ALERT_EMAIL || list(env.EMAIL_SANDBOX_TO)[0] || null,
    subjectStyle: style === 'a' || style === 'c' ? style : 'b', // b chosen by the owner
    tokenSecret: env.EMAIL_TOKEN_SECRET || '',
    cronSecret: env.CRON_SECRET || null,
    turnstileSecret: env.TURNSTILE_SECRET_KEY || null,
    sendHour: Number(env.EMAIL_SEND_HOUR ?? 7),
    healthHour: Number(env.EMAIL_HEALTH_HOUR ?? 8),
    ratePerSecond: Math.max(0.2, Number(env.SES_RATE_PER_SECOND ?? 1)),
    supabaseUrl: env.SUPABASE_URL || env.VITE_SUPABASE_URL || null,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || null,
    ses: {
      region: env.SES_REGION || 'eu-central-1',
      accessKeyId: env.SES_ACCESS_KEY_ID || null,
      secretAccessKey: env.SES_SECRET_ACCESS_KEY || null,
    },
  };
}
