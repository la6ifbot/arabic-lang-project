/**
 * Auth redirects come back to the site with a marker we add (`durar=verify|reset|oauth`) and, from
 * Supabase, either `code` (PKCE) or an error. Read them once at startup, before the client consumes
 * the URL, so the UI can explain what happened.
 *
 * The sign-up and reset emails (supabase/auth-templates) link straight here with
 * `durar=verify|reset&token_hash=…` instead. The site verifies the hash itself, so the link works in
 * any browser, not only the one that asked for it (a PKCE `code` needs that browser's verifier).
 * Those links must be built from the Site URL, never from `redirect_to`: a token hash sent to another
 * origin is enough to sign in there.
 */
import type { AccountUser, EmailLinkResult, UrlNotice } from './types';

export type AuthIntent = 'verify' | 'reset' | 'oauth';

export interface AuthUrlState {
  intent: AuthIntent | null;
  hasCode: boolean;
  /** From the email templates; only meaningful with intent `verify` or `reset`. */
  tokenHash: string | null;
  error: string | null;
}

export const AUTH_PARAM = 'durar';

export function readAuthUrl(): AuthUrlState {
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const intent = q.get(AUTH_PARAM);
  return {
    intent: intent === 'verify' || intent === 'reset' || intent === 'oauth' ? intent : null,
    hasCode: q.has('code'),
    tokenHash: q.get('token_hash') || null,
    error: q.get('error_description') ?? h.get('error_description') ?? q.get('error') ?? h.get('error'),
  };
}

/** Is this visit a link from one of our auth emails, which the site verifies itself? */
export function isEmailLink(s: AuthUrlState): boolean {
  return s.tokenHash !== null && (s.intent === 'verify' || s.intent === 'reset');
}

/**
 * What to tell the visitor once the session is known. `emailLink` is the result of checking an
 * email link (null when this visit isn't one); `user` is whoever is signed in afterwards.
 */
export function urlNotice(s: AuthUrlState, emailLink: EmailLinkResult | null, user: AccountUser | null): UrlNotice | undefined {
  if (emailLink === 'offline') return 'link-offline';
  if (emailLink === 'ok') return s.intent === 'reset' ? (user ? 'recovery' : 'reset-link-invalid') : user ? 'verified' : 'verified-sign-in';
  // A used link: never open "choose a new password" for an older session; someone already signed
  // in (e.g. clicking the confirmation link twice) needs no error.
  if (emailLink === 'failed') return s.intent === 'reset' ? 'reset-link-invalid' : user ? undefined : 'verify-link-invalid';
  if (s.intent === 'reset') return user ? 'recovery' : 'reset-link-invalid';
  if (s.error) return s.intent === 'verify' ? 'verify-link-invalid' : 'oauth-failed';
  if (s.hasCode && !user) return s.intent === 'verify' ? 'verified-sign-in' : 'oauth-failed';
  return undefined;
}

export function hasAuthCallback(): boolean {
  const s = readAuthUrl();
  return s.intent !== null || s.hasCode || s.tokenHash !== null || s.error !== null;
}

/** Removes our marker, the email's token hash and any auth error params, keeping the path (e.g. /word/bahr). */
export function cleanAuthUrl() {
  const url = new URL(window.location.href);
  let changed = false;
  for (const k of [AUTH_PARAM, 'token_hash', 'error', 'error_code', 'error_description']) {
    if (url.searchParams.has(k)) {
      url.searchParams.delete(k);
      changed = true;
    }
  }
  if (/error_description|error=/.test(url.hash)) {
    url.hash = '';
    changed = true;
  }
  if (!changed) return;
  try {
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* sandboxed frames */
  }
}

/** Where an auth email or OAuth provider should send the visitor back to. */
export function returnUrl(intent: AuthIntent, path = window.location.pathname): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set(AUTH_PARAM, intent);
  return url.toString();
}
