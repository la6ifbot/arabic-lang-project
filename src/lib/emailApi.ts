import { accountsMode } from '../account/backend';
import { MOCK_EMAIL_KEY } from '../account/storageKeys';

/** Client for the Pearl of the Day email endpoints (/api/*). */
export type SubscribeResult = 'check_inbox' | 'confirmed';
export type EmailApiErrorCode = 'invalid_email' | 'rate_limited' | 'network' | 'server';

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
  if (res.status >= 500) throw new EmailApiError('server');
  return { status: res.status, data };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function subscribeEmail(email: string, opts: { website?: string; accessToken?: string | null } = {}): Promise<SubscribeResult> {
  const e = email.trim().toLowerCase();
  if (!EMAIL.test(e)) throw new EmailApiError('invalid_email');
  if (mock) {
    await new Promise((r) => setTimeout(r, 150));
    // A signed-in Google account's address is already verified: no confirmation step.
    const verified = !!opts.accessToken && opts.accessToken.startsWith('mock:google:') && opts.accessToken.endsWith(`:${e}`);
    const next = verified ? 'confirmed' : mockStore()[e] === 'confirmed' ? 'confirmed' : 'pending';
    mockStore((m) => (m[e] = next));
    return verified ? 'confirmed' : 'check_inbox';
  }
  const headers: Record<string, string> = opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {};
  const { data } = await post('/api/subscribe', { email: e, website: opts.website ?? '' }, headers);
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
