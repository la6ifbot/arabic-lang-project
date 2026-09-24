import {
  createClient,
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
  type AuthChangeEvent,
  type User,
} from '@supabase/supabase-js';
import { AccountError, type AccountErrorCode, type AccountUser, type Backend, type SubscriptionStatus, type UrlNotice } from './types';
import { SESSION_STORAGE_KEY } from './storageKeys';
import { readAuthUrl } from './urlState';

const toUser = (u: User): AccountUser => ({
  id: u.id,
  email: u.email ?? null,
  provider: (u.app_metadata?.provider as string | undefined) ?? 'email',
});

const AUTH_CODES: Partial<Record<string, AccountErrorCode>> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  user_already_exists: 'email_taken',
  email_exists: 'email_taken',
  weak_password: 'weak_password',
  same_password: 'same_password',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
  // Until custom SMTP is set up, Supabase's built-in mailer refuses addresses outside the team.
  email_address_not_authorized: 'email_unavailable',
  email_address_invalid: 'invalid_email',
};

function authError(error: unknown): AccountError {
  if (isAuthRetryableFetchError(error)) return new AccountError('network', error.message);
  if (isAuthWeakPasswordError(error)) return new AccountError('weak_password', error.message);
  if (isAuthApiError(error)) {
    const code = (error.code && AUTH_CODES[error.code]) || (error.status === 429 ? 'rate_limited' : undefined);
    if (code) return new AccountError(code, error.message);
    if (/invalid login credentials/i.test(error.message)) return new AccountError('invalid_credentials', error.message);
    if (/email not confirmed/i.test(error.message)) return new AccountError('email_not_confirmed', error.message);
    if (/error sending .*email/i.test(error.message)) return new AccountError('email_unavailable', error.message);
  }
  if (error instanceof Error && /fetch|network/i.test(error.message)) return new AccountError('network', error.message);
  return new AccountError('unknown', error instanceof Error ? error.message : String(error));
}

function dataError(error: { code?: string; message: string }): AccountError {
  if (error.code === 'P0001' && /pearl limit/.test(error.message)) return new AccountError('limit_reached', error.message);
  if (!error.code && /fetch|network/i.test(error.message)) return new AccountError('network', error.message);
  return new AccountError('unknown', `${error.code ?? ''} ${error.message}`.trim());
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const urlState = readAuthUrl(); // before the client consumes ?code
  const client = createClient(url, anonKey, {
    // keepalive lets a save or removal finish even if the visitor closes the tab right after.
    global: { fetch: (input, init) => fetch(input, { ...init, keepalive: true }) },
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: SESSION_STORAGE_KEY,
    },
  });

  /** Unwraps a Supabase auth response, turning any failure into an AccountError. */
  const guard = async <R extends { error: unknown }>(p: Promise<R>): Promise<R> => {
    let res: R;
    try {
      res = await p;
    } catch (e) {
      throw authError(e);
    }
    if (res.error) throw authError(res.error);
    return res;
  };

  return {
    kind: 'supabase',

    async init() {
      const { data } = await client.auth.getSession();
      const user = data.session ? toUser(data.session.user) : null;
      let notice: UrlNotice | undefined;
      if (urlState.intent === 'reset') notice = user ? 'recovery' : 'reset-link-invalid';
      else if (urlState.error) notice = urlState.intent === 'verify' ? 'verify-link-invalid' : 'oauth-failed';
      else if (urlState.hasCode && !user) notice = urlState.intent === 'verify' ? 'verified-sign-in' : 'oauth-failed';
      return { user, notice };
    },

    onChange(cb) {
      const { data } = client.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
        // Defer: calling Supabase from inside this callback can deadlock its auth lock.
        setTimeout(() => {
          if (event === 'SIGNED_IN' && session) cb('signed-in', toUser(session.user));
          else if (event === 'SIGNED_OUT') cb('signed-out', null);
          else if (event === 'PASSWORD_RECOVERY' && session) cb('password-recovery', toUser(session.user));
        }, 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async signUp(email, password, returnTo) {
      const { data } = await guard(client.auth.signUp({ email, password, options: { emailRedirectTo: returnTo } }));
      // With email confirmation on, Supabase answers an existing address with an empty identity
      // list instead of an error (so addresses can't be probed silently).
      if (data.user && data.user.identities && data.user.identities.length === 0) throw new AccountError('email_taken');
      return { needsVerification: !data.session };
    },

    async signIn(email, password) {
      const { data } = await guard(client.auth.signInWithPassword({ email, password }));
      if (!data.user) throw new AccountError('unknown', 'no user returned');
      return toUser(data.user);
    },

    async signInWithGoogle(returnTo) {
      await guard(client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnTo } }));
    },

    async signOut() {
      await guard(client.auth.signOut());
    },

    async requestPasswordReset(email, returnTo) {
      await guard(client.auth.resetPasswordForEmail(email, { redirectTo: returnTo }));
    },

    async updatePassword(password) {
      await guard(client.auth.updateUser({ password }));
    },

    async resendVerification(email, returnTo) {
      await guard(client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: returnTo } }));
    },

    async listSaved() {
      const { data, error } = await client
        .from('saved_pearls')
        .select('word_slug, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw dataError(error);
      return (data ?? []).map((r) => ({ slug: r.word_slug as string, savedAt: r.created_at as string }));
    },

    async save(slug, savedAt) {
      const row: Record<string, string> = { word_slug: slug };
      if (savedAt) row.created_at = savedAt;
      const { error } = await client.from('saved_pearls').insert(row);
      if (error && error.code !== '23505') throw dataError(error); // 23505: already saved
    },

    async unsave(slug) {
      const { error } = await client.from('saved_pearls').delete().eq('word_slug', slug);
      if (error) throw dataError(error);
    },

    async accessToken() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },

    async getSubscription() {
      const { data, error } = await client.rpc('my_subscription');
      if (error) throw dataError(error);
      return (data ?? 'none') as SubscriptionStatus;
    },

    async unsubscribeMe() {
      const { error } = await client.rpc('unsubscribe_me');
      if (error) throw dataError(error);
    },

    async deleteAccount() {
      const { error } = await client.rpc('delete_my_account');
      if (error) throw dataError(error);
      // The user no longer exists; just drop the local session.
      await client.auth.signOut({ scope: 'local' });
    },
  };
}
