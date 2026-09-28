import { readFileSync } from 'node:fs';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
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

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: () => ({ auth }),
}));

const EXPIRED = new AuthApiError('Email link is invalid or has expired', 403, 'otp_expired');

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
  auth.initialize.mockClear();
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
    // A stored session finishes loading first, so it can't overwrite the new one.
    expect(auth.initialize.mock.invocationCallOrder[0]).toBeLessThan(auth.verifyOtp.mock.invocationCallOrder[0]);
    expect(res).toEqual({ user: { id: 'u1', email: 'layla@example.com', provider: 'email' }, notice: 'recovery' });
  });

  it('an expired or used reset link says so', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: EXPIRED });
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const res = await init('https://durar.space/?durar=reset&token_hash=old');
    expect(res).toEqual({ user: null, notice: 'reset-link-invalid' });
  });

  it('a failed reset link never opens "choose a new password", even with an older session', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: EXPIRED });
    auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });
    const res = await init('https://durar.space/?durar=reset&token_hash=old');
    expect(res.notice).toBe('reset-link-invalid');
  });

  it('a confirmation link verifies the hash, signs the visitor in and says so', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });
    const res = await init('https://durar.space/?durar=verify&token_hash=xyz');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'xyz', type: 'email' });
    expect(res).toEqual({ user: { id: 'u1', email: 'layla@example.com', provider: 'email' }, notice: 'verified' });
  });

  it('a used confirmation link needs no message for someone already signed in', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: EXPIRED });
    auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });
    const res = await init('https://durar.space/?durar=verify&token_hash=used');
    expect(res.notice).toBeUndefined();
  });

  it('an expired or used confirmation link says so', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: EXPIRED });
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const res = await init('https://durar.space/?durar=verify&token_hash=old');
    expect(res).toEqual({ user: null, notice: 'verify-link-invalid' });
  });

  it('a network failure is not reported as an expired link', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const res = await init('https://durar.space/?durar=reset&token_hash=abc');
    expect(res.notice).toBe('link-offline');
  });

  it('an unexpected throw while verifying is treated the same way, not a crash', async () => {
    auth.verifyOtp.mockRejectedValue(new TypeError('Failed to fetch'));
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const res = await init('https://durar.space/?durar=verify&token_hash=abc');
    expect(res.notice).toBe('link-offline');
  });

  it('a token_hash without our verify or reset marker is ignored', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    expect(await init('https://durar.space/?token_hash=abc')).toEqual({ user: null, notice: undefined });
    expect(await init('https://durar.space/?durar=oauth&token_hash=abc')).toEqual({ user: null, notice: undefined });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
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

describe('the email templates', () => {
  // The owner pastes these into Supabase by hand, so check that every link in them is one the site
  // understands, as Supabase renders it.
  for (const [file, intent] of [
    ['confirm-signup.html', 'verify'],
    ['reset-password.html', 'reset'],
  ] as const) {
    it(`${file} links to durar.space with durar=${intent} and the token hash`, async () => {
      const html = readFileSync(new URL(`../../supabase/auth-templates/${file}`, import.meta.url), 'utf8');
      expect(html).not.toContain('.ConfirmationURL');
      expect(html).not.toContain('.RedirectTo');
      const hrefs = [...html.matchAll(/href="([^"]*\{\{[^"]*)"/g)].map((m) => m[1]);
      expect(hrefs).toHaveLength(2);
      const { readAuthUrl } = await import('../../src/account/urlState');
      for (const href of hrefs) {
        visit(href.replace('{{ .SiteURL }}', 'https://durar.space').replace('{{ .TokenHash }}', 'pkce_abc').replaceAll('&amp;', '&'));
        expect(readAuthUrl()).toEqual({ intent, hasCode: false, tokenHash: 'pkce_abc', error: null });
      }
    });
  }
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
