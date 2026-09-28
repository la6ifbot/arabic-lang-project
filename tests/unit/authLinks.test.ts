import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The sign-up and reset emails link to durar.space with `durar=verify|reset&token_hash=…`. The site
// verifies the hash itself, so the link works in any browser (a PKCE `code` only works in the one
// that asked for it). These tests drive createSupabaseBackend().init() against a fake client.

const auth = {
  initialize: vi.fn(async () => ({ error: null })),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth }),
  isAuthApiError: () => false,
  isAuthRetryableFetchError: () => false,
  isAuthWeakPasswordError: () => false,
}));

const USER = { id: 'u1', email: 'layla@example.com', app_metadata: { provider: 'email' } };
let replaced: string | null = null;

function visit(href: string) {
  const url = new URL(href);
  replaced = null;
  vi.stubGlobal('window', {
    location: { href: url.href, search: url.search, hash: url.hash, pathname: url.pathname, origin: url.origin },
    history: {
      state: null,
      replaceState: (_s: unknown, _t: string, next: string) => {
        replaced = next;
      },
    },
  });
}

async function init(href: string) {
  visit(href);
  const { createSupabaseBackend } = await import('../../src/account/supabaseBackend');
  return createSupabaseBackend('https://example.supabase.co', 'anon').init();
}

beforeEach(() => {
  vi.resetModules();
  auth.verifyOtp.mockReset();
  auth.getSession.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('links from the auth emails (token_hash)', () => {
  it('a reset link verifies the hash and opens "choose a new password"', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });
    const res = await init('https://durar.space/?durar=reset&token_hash=abc123');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'recovery' });
    expect(res).toEqual({ user: { id: 'u1', email: 'layla@example.com', provider: 'email' }, notice: 'recovery' });
  });

  it('an expired or used reset link says so', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: { message: 'Email link is invalid or has expired' } });
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const res = await init('https://durar.space/?durar=reset&token_hash=old');
    expect(res).toEqual({ user: null, notice: 'reset-link-invalid' });
  });

  it('a failed reset link never opens "choose a new password", even with an older session', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: { message: 'expired' } });
    auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });
    const res = await init('https://durar.space/?durar=reset&token_hash=old');
    expect(res.notice).toBe('reset-link-invalid');
  });

  it('a confirmation link verifies the hash and signs the visitor in', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });
    const res = await init('https://durar.space/?durar=verify&token_hash=xyz');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'xyz', type: 'email' });
    expect(res).toEqual({ user: { id: 'u1', email: 'layla@example.com', provider: 'email' }, notice: undefined });
  });

  it('an expired or used confirmation link says so', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: { message: 'expired' } });
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const res = await init('https://durar.space/?durar=verify&token_hash=old');
    expect(res).toEqual({ user: null, notice: 'verify-link-invalid' });
  });

  it('a network failure while verifying counts as a failed link, not a crash', async () => {
    auth.verifyOtp.mockRejectedValue(new TypeError('Failed to fetch'));
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const res = await init('https://durar.space/?durar=reset&token_hash=abc');
    expect(res.notice).toBe('reset-link-invalid');
  });

  it('a token_hash without our marker is ignored', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const res = await init('https://durar.space/?token_hash=abc');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(res).toEqual({ user: null, notice: undefined });
  });
});

describe('older links (PKCE code) still work as before', () => {
  it('reset with a code and a session opens "choose a new password"', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });
    const res = await init('https://durar.space/word/bahr?durar=reset&code=c1');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(res.notice).toBe('recovery');
  });

  it('reset with a code opened in another browser says so', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const res = await init('https://durar.space/?durar=reset&code=c1');
    expect(res.notice).toBe('reset-link-invalid');
  });

  it('verify with a code opened in another browser asks the visitor to sign in', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const res = await init('https://durar.space/?durar=verify&code=c1');
    expect(res.notice).toBe('verified-sign-in');
  });
});

describe('url helpers', () => {
  it('hasAuthCallback sees an email link, and cleanAuthUrl removes the marker and the hash', async () => {
    visit('https://durar.space/word/bahr?durar=reset&token_hash=abc&keep=1');
    const { hasAuthCallback, cleanAuthUrl } = await import('../../src/account/urlState');
    expect(hasAuthCallback()).toBe(true);
    cleanAuthUrl();
    expect(replaced).toBe('https://durar.space/word/bahr?keep=1');
  });
});
