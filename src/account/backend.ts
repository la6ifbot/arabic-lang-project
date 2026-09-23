import type { Backend } from './types';
import { MOCK_DB_KEY, SESSION_STORAGE_KEY } from './storageKeys';

export type AccountsMode = 'supabase' | 'mock' | 'off';

/** Decided once at startup. Accounts are simply hidden when the site has no backend configured. */
export const accountsMode: AccountsMode =
  import.meta.env.VITE_BACKEND === 'mock' || (typeof window !== 'undefined' && window.__DURAR_MOCK__)
    ? 'mock'
    : import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
      ? 'supabase'
      : 'off';

/** True when a previous visit left a signed-in session, so the UI can avoid flashing “Sign in”. */
export function hasStoredSession(): boolean {
  try {
    if (accountsMode === 'mock') return JSON.parse(localStorage.getItem(MOCK_DB_KEY) ?? '{}').sessionUserId != null;
    if (accountsMode === 'supabase') return localStorage.getItem(SESSION_STORAGE_KEY) !== null;
  } catch {
    /* storage blocked */
  }
  return false;
}

/**
 * Preview builds (VITE_BACKEND=mock) run a self-contained demo: sign-up needs no email and
 * everything stays in this browser. Tests use the same mock but keep the email step.
 */
export const accountsDemo = import.meta.env.VITE_BACKEND === 'mock';

let loading: Promise<Backend> | null = null;

/** The accounts client is its own lazy chunk, so it never delays the first paint or the scene. */
export function loadBackend(): Promise<Backend> {
  loading ??=
    accountsMode === 'mock'
      ? import('./mockBackend').then((m) => m.createMockBackend({ demo: accountsDemo }))
      : import('./supabaseBackend').then((m) =>
          m.createSupabaseBackend(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_ANON_KEY!),
        );
  return loading;
}
