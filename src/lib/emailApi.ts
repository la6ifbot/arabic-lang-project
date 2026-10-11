import { accountsMode } from '../account/backend';
import { MOCK_EMAIL_KEY } from '../account/storageKeys';

/** Client for the Pearl of the Day email endpoints (/api/*). */
export type SubscribeResult = 'check_inbox' | 'confirmed';
export type EmailApiErrorCode = 'invalid_email' | 'rate_limited' | 'captcha_failed' | 'network' | 'server';

export class EmailApiError extends Error {
  constructor(readonly code: EmailApiErrorCode) {
    super(code);
  }
}

const mock = accountsMode === 'mock';

function mockStore(update?: (m: Record<string, string>) => void) {
  let m: Record<string, string> = {};
  try {
    m = JSON.parse(localStorage.getItem(MOCK_EMAIL_KEY) ?? '{}');
  } catch {
    /* empty */
  }
  if (update) {
    update(m);
    try {
      localStorage.setItem(MOCK_EMAIL_KEY, JSON.stringify(m));
    } catch {
      /* ignore */
    }
  }
  return m;
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } catch {
    throw new EmailApiError('network');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (res.status === 429) throw new EmailApiError('rate_limited');
  if (res.status === 400 && data.error === 'invalid_email') throw new EmailApiError('invalid_email');
  if (res.status === 403 && data.error === 'captcha_failed') throw new EmailApiError('captcha_failed');
  if (res.status >= 500) throw new EmailApiError('server');
  return { status: res.status, data };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function subscribeEmail(
  email: string,
  opts: { website?: string; accessToken?: string | null; turnstileToken?: string | null } = {},
): Promise<SubscribeResult> {
  const e = email.trim().toLowerCase();
  if (!EMAIL.test(e)) throw new EmailApiError('invalid_email');
  if (mock) {
    await new Promise((r) => setTimeout(r, 150));
    // A signed-in Google account's address is already verified: no confirmation step.
    const own = !!opts.accessToken && opts.accessToken.endsWith(`:${e}`);
    const verified = own && opts.accessToken!.startsWith('mock:google:');
    const next = verified ? 'confirmed' : mockStore()[e] === 'confirmed' ? 'confirmed' : 'pending';
    mockStore((m) => (m[e] = next));
    // Like the server, only the address's own account hears that it's already subscribed.
    return verified || (own && next === 'confirmed') ? 'confirmed' : 'check_inbox';
  }
  const headers: Record<string, string> = opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {};
  const body = { email: e, website: opts.website ?? '', ...(opts.turnstileToken ? { turnstile: opts.turnstileToken } : {}) };
  const { status, data } = await post('/api/subscribe', body, headers);
  // Only the endpoint's own answer counts as success: never tell someone to check their inbox
  // when the request was refused or answered by something else (a 403, a 404 page).
  if (status !== 200 || (data as { ok?: unknown }).ok !== true) throw new EmailApiError('server');
  return data.status === 'confirmed' ? 'confirmed' : 'check_inbox';
}

export async function confirmSubscription(token: string): Promise<string> {
  if (mock) return token ? 'confirmed' : 'invalid';
  const { data } = await post('/api/confirm', { token });
  return data.status ?? 'invalid';
}

export async function unsubscribeWithToken(token: string, resubscribe = false): Promise<string> {
  if (mock) return token ? (resubscribe ? 'confirmed' : 'unsubscribed') : 'invalid';
  const { data } = await post(`/api/unsubscribe?token=${encodeURIComponent(token)}`, resubscribe ? { action: 'resubscribe' } : {});
  return data.status ?? 'invalid';
}
