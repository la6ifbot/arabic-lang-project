/**
 * Auth redirects come back to the site with a marker we add (`durar=verify|reset|oauth`) and, from
 * Supabase, either `code` (PKCE) or an error. Read them once at startup, before the client consumes
 * the URL, so the UI can explain what happened.
 */
export type AuthIntent = 'verify' | 'reset' | 'oauth';

export interface AuthUrlState {
  intent: AuthIntent | null;
  hasCode: boolean;
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
    error: q.get('error_description') ?? h.get('error_description') ?? q.get('error') ?? h.get('error'),
  };
}

export function hasAuthCallback(): boolean {
  const s = readAuthUrl();
  return s.intent !== null || s.hasCode || s.error !== null;
}

/** Removes our marker and any auth error params, keeping the path (e.g. /word/bahr). */
export function cleanAuthUrl() {
  const url = new URL(window.location.href);
  let changed = false;
  for (const k of [AUTH_PARAM, 'error', 'error_code', 'error_description']) {
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
