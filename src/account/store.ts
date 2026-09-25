import { create } from 'zustand';
import { useRoute } from '../lib/router';
import { WORD_BY_SLUG } from '../lib/words';
import { useDurar } from '../state/store';
import { accountsMode, hasStoredSession, loadBackend } from './backend';
import { friendlyMessage } from './errors';
import { PENDING_SAVE_KEY } from './storageKeys';
import type { AccountUser, AuthChange, Backend, SubscriptionStatus, UrlNotice } from './types';
import { cleanAuthUrl, hasAuthCallback } from './urlState';

export type AccountStatus = 'off' | 'loading' | 'signed-out' | 'signed-in';
export type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset' | 'verify-sent' | 'reset-sent';

export interface AuthDialog {
  mode: AuthMode;
  /** One line explaining why the dialog opened, e.g. “Sign in to keep this pearl”. */
  reason?: string;
  /** The word waiting to be saved, shown next to the reason. */
  reasonSlug?: string;
  /** Pre-filled / confirmed address for follow-up screens. */
  email?: string;
  /** A calm informational message (e.g. “Your email is confirmed”). */
  notice?: string;
  /** An error to show when the dialog opens (e.g. a failed Google redirect). */
  error?: string;
}

interface AccountState {
  status: AccountStatus;
  user: AccountUser | null;
  /** slug → ISO date saved. May include slugs no longer in words.json; the UI skips those. */
  saved: Record<string, string>;
  savedLoaded: boolean;
  auth: AuthDialog | null;
  confirmDelete: boolean;
  /** Drives the rim glint on the card that was just saved. */
  glint: { slug: string; at: number } | null;
  /** Visible, short-lived message next to the save control when a save fails. */
  saveError: { slug: string; text: string; at: number } | null;
  /** Polite screen-reader announcement; `id` changes so repeats are re-announced. */
  announcement: { text: string; id: number };
}

const initialStatus = (): AccountStatus =>
  accountsMode === 'off' ? 'off' : hasStoredSession() || hasAuthCallback() ? 'loading' : 'signed-out';

export const useAccount = create<AccountState>(() => ({
  status: initialStatus(),
  user: null,
  saved: {},
  savedLoaded: false,
  auth: null,
  confirmDelete: false,
  glint: null,
  saveError: null,
  announcement: { text: '', id: 0 },
}));

const set = useAccount.setState;
const get = useAccount.getState;

const wordName = (slug: string) => WORD_BY_SLUG.get(slug)?.ar ?? slug;

export function announce(text: string) {
  set((s) => ({ announcement: { text, id: s.announcement.id + 1 } }));
}

// ---------------------------------------------------------------------------------------------
// Pending save: a signed-out visitor asked to save a word; keep it until they finish signing in
// (which may involve an email link or a Google redirect), then save it for them.

const PENDING_TTL = 24 * 60 * 60 * 1000;

function setPending(slug: string) {
  try {
    localStorage.setItem(PENDING_SAVE_KEY, JSON.stringify({ slug, at: Date.now() }));
  } catch {
    /* storage blocked: the save just won't survive a redirect */
  }
}

function takePending(): string | null {
  try {
    const raw = localStorage.getItem(PENDING_SAVE_KEY);
    localStorage.removeItem(PENDING_SAVE_KEY);
    if (!raw) return null;
    const { slug, at } = JSON.parse(raw) as { slug: string; at: number };
    return Date.now() - at < PENDING_TTL ? slug : null;
  } catch {
    return null;
  }
}

export function clearPending() {
  try {
    localStorage.removeItem(PENDING_SAVE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------------------------
// Backend lifecycle

let booting: Promise<Backend | null> | null = null;

/**
 * Loads the accounts client (lazily, after the scene is up) and restores any session. Safe to call
 * many times; every account action awaits it.
 */
export function bootAccounts(): Promise<Backend | null> {
  if (accountsMode === 'off') return Promise.resolve(null);
  booting ??= (async () => {
    try {
      const backend = await loadBackend();
      backend.onChange(onAuthChange);
      const { user, notice } = await backend.init();
      if (user) await signedIn(user, backend);
      else set({ status: 'signed-out', user: null });
      if (notice) showNotice(notice);
      return backend;
    } catch (e) {
      console.warn('Durar: accounts unavailable right now.', e);
      set({ status: 'signed-out' });
      booting = null; // allow a retry on the next action
      return null;
    } finally {
      cleanAuthUrl();
    }
  })();
  return booting;
}

async function requireBackend(): Promise<Backend> {
  const b = await bootAccounts();
  if (!b) throw new Error('network: accounts backend unavailable');
  return b;
}

function onAuthChange(change: AuthChange, user: AccountUser | null) {
  if (change === 'signed-out') {
    set({ status: 'signed-out', user: null, saved: {}, savedLoaded: false, confirmDelete: false });
    useEmailToggle.setState({ state: 'unknown' });
    return;
  }
  if (!user) return;
  void (async () => {
    await signedIn(user, await loadBackend());
    if (change === 'password-recovery') openAuth('reset');
  })();
}

let loadingSavedFor: string | null = null;

async function signedIn(user: AccountUser, backend: Backend) {
  const s = get();
  const sameUser = s.user?.id === user.id && s.savedLoaded;
  set({ status: 'signed-in', user });
  if (!sameUser && loadingSavedFor !== user.id) {
    loadingSavedFor = user.id;
    try {
      const list = await backend.listSaved();
      const saved: Record<string, string> = {};
      for (const p of list) saved[p.slug] = p.savedAt;
      // Keep anything saved optimistically while the list was loading.
      set((st) => ({ saved: { ...saved, ...st.saved }, savedLoaded: true }));
    } catch (e) {
      console.warn('Durar: could not load saved pearls.', e);
      set({ savedLoaded: true });
    } finally {
      loadingSavedFor = null;
    }
  }
  await savePending(backend);
}

async function savePending(backend: Backend) {
  const slug = takePending();
  if (!slug || !WORD_BY_SLUG.has(slug)) return;
  // Bring the visitor back to the card they were on.
  if (useRoute.getState().route.name === 'scene' && useDurar.getState().order[0] !== slug) {
    useDurar.getState().surface(slug);
  }
  if (get().saved[slug]) return;
  await persistSave(slug, backend);
}

function showNotice(notice: UrlNotice) {
  switch (notice) {
    case 'recovery':
      openAuth('reset');
      break;
    case 'verified-sign-in':
      openAuth('signin', { notice: 'Your email is confirmed. Sign in to continue.' });
      break;
    case 'verify-link-invalid':
      openAuth('signin', {
        error: 'That confirmation link has expired or was already used. Sign in, and we’ll help you get a fresh one if you need it.',
      });
      break;
    case 'reset-link-invalid':
      openAuth('forgot', {
        error: 'That reset link has expired, or it was opened in a different browser. Request a new one below.',
      });
      break;
    case 'oauth-failed':
      openAuth('signin', { error: 'Google sign-in didn’t finish. Please try again.' });
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// Dialogs

export function openAuth(mode: AuthMode = 'signin', extra: Omit<AuthDialog, 'mode'> = {}) {
  if (accountsMode === 'off') return;
  set({ auth: { mode, ...extra } });
  void bootAccounts();
}

export function setAuthMode(mode: AuthMode, extra: Omit<AuthDialog, 'mode'> = {}) {
  set((s) => ({ auth: s.auth ? { ...s.auth, notice: undefined, error: undefined, ...extra, mode } : { mode, ...extra } }));
}

export function closeAuth() {
  const mode = get().auth?.mode;
  // Walking away from sign-in cancels the pending save; waiting for an email link keeps it.
  if (get().status !== 'signed-in' && mode !== 'verify-sent') clearPending();
  set({ auth: null });
}

// ---------------------------------------------------------------------------------------------
// Auth actions (used by the dialog). Each throws AccountError; the dialog shows friendlyMessage().

export const auth = {
  async signIn(email: string, password: string) {
    const b = await requireBackend();
    const user = await b.signIn(email, password);
    set({ auth: null });
    await signedIn(user, b);
    announce('Signed in.');
  },
  async signUp(email: string, password: string, returnTo: string) {
    const b = await requireBackend();
    const { needsVerification } = await b.signUp(email, password, returnTo);
    if (needsVerification) setAuthMode('verify-sent', { email });
    else {
      // “Confirm email” is off (the interim setup): Supabase signs the new account straight in,
      // and its signed-in event saves any pearl that was waiting.
      set({ auth: null });
      announce('Welcome to Durar. You’re signed in.');
    }
  },
  async google(returnTo: string) {
    const b = await requireBackend();
    await b.signInWithGoogle(returnTo);
    if (b.kind === 'mock') set({ auth: null });
  },
  async requestReset(email: string, returnTo: string) {
    const b = await requireBackend();
    await b.requestPasswordReset(email, returnTo);
    setAuthMode('reset-sent', { email });
  },
  async updatePassword(password: string) {
    const b = await requireBackend();
    await b.updatePassword(password);
    set({ auth: null });
    announce('Your password has been changed.');
  },
  async resend(email: string, returnTo: string) {
    const b = await requireBackend();
    await b.resendVerification(email, returnTo);
  },
};

export async function signOut() {
  const b = await requireBackend();
  await b.signOut();
  set({ status: 'signed-out', user: null, saved: {}, savedLoaded: false });
  announce('Signed out.');
}

export async function deleteAccount() {
  const b = await requireBackend();
  await b.deleteAccount();
  clearPending();
  set({ status: 'signed-out', user: null, saved: {}, savedLoaded: false, confirmDelete: false });
  announce('Your account, saved pearls and progress have been deleted.');
}

// ---------------------------------------------------------------------------------------------
// Saving. Optimistic: the UI changes at once and rolls back if the request fails. A per-word
// version number makes sure a slow, stale response never overrides a newer tap.

const versions = new Map<string, number>();
const bump = (slug: string) => {
  const v = (versions.get(slug) ?? 0) + 1;
  versions.set(slug, v);
  return v;
};

function addSaved(slug: string, savedAt: string) {
  set((s) => ({ saved: { ...s.saved, [slug]: savedAt } }));
}

function dropSaved(slug: string) {
  set((s) => {
    const next = { ...s.saved };
    delete next[slug];
    return { saved: next };
  });
}

async function persistSave(slug: string, backend: Backend, savedAt = new Date().toISOString()) {
  const v = bump(slug);
  addSaved(slug, savedAt);
  set({ glint: { slug, at: performance.now() }, saveError: null });
  announce(`Saved ${wordName(slug)} to My Pearls.`);
  try {
    await backend.save(slug, savedAt);
  } catch (e) {
    if (versions.get(slug) !== v) return;
    dropSaved(slug);
    const text = `Couldn’t save ${wordName(slug)}. ${friendlyMessage(e)}`;
    set({ saveError: { slug, text, at: Date.now() } });
    announce(text);
  }
}

async function persistUnsave(slug: string, backend: Backend) {
  const v = bump(slug);
  const previous = get().saved[slug];
  dropSaved(slug);
  set({ saveError: null });
  announce(`Removed ${wordName(slug)} from My Pearls.`);
  try {
    await backend.unsave(slug);
  } catch (e) {
    if (versions.get(slug) !== v) return;
    if (previous) addSaved(slug, previous);
    const text = `Couldn’t remove ${wordName(slug)}. ${friendlyMessage(e)}`;
    set({ saveError: { slug, text, at: Date.now() } });
    announce(text);
  }
}

/** The save control / “S” key on the focused card. */
export async function toggleSave(slug: string) {
  if (accountsMode === 'off') return;
  if (get().status === 'loading') await bootAccounts();
  if (get().status !== 'signed-in') {
    setPending(slug);
    openAuth('signin', { reason: 'Sign in to keep this pearl', reasonSlug: slug });
    return;
  }
  const backend = await requireBackend();
  if (get().saved[slug]) await persistUnsave(slug, backend);
  else await persistSave(slug, backend);
}

/** Library: remove now; returns the original date so “Undo” can put it back in place. */
export async function removePearl(slug: string): Promise<string | undefined> {
  const savedAt = get().saved[slug];
  await persistUnsave(slug, await requireBackend());
  return savedAt;
}

export async function restorePearl(slug: string, savedAt: string) {
  const backend = await requireBackend();
  const v = bump(slug);
  addSaved(slug, savedAt);
  announce(`Restored ${wordName(slug)} to My Pearls.`);
  try {
    await backend.save(slug, savedAt);
  } catch (e) {
    if (versions.get(slug) !== v) return;
    dropSaved(slug);
    announce(`Couldn’t restore ${wordName(slug)}. ${friendlyMessage(e)}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Pearl of the Day email, for signed-in users (the account-menu toggle).

export type EmailToggle = 'unknown' | 'loading' | 'off' | 'pending' | 'on' | 'blocked';

export const useEmailToggle = create<{ state: EmailToggle }>(() => ({ state: 'unknown' }));

const toToggle = (s: SubscriptionStatus): EmailToggle =>
  s === 'confirmed' ? 'on' : s === 'pending' ? 'pending' : s === 'bounced' || s === 'complained' ? 'blocked' : 'off';

export async function loadEmailToggle() {
  if (get().status !== 'signed-in') return;
  useEmailToggle.setState({ state: 'loading' });
  try {
    useEmailToggle.setState({ state: toToggle(await (await requireBackend()).getSubscription()) });
  } catch {
    useEmailToggle.setState({ state: 'unknown' });
  }
}

export async function setEmailToggle(on: boolean) {
  const user = get().user;
  if (!user?.email) return;
  const backend = await requireBackend();
  const previous = useEmailToggle.getState().state;
  useEmailToggle.setState({ state: 'loading' });
  try {
    if (on) {
      const { subscribeEmail } = await import('../lib/emailApi');
      const result = await subscribeEmail(user.email, { accessToken: await backend.accessToken() });
      useEmailToggle.setState({ state: result === 'confirmed' ? 'on' : 'pending' });
      announce(
        result === 'confirmed'
          ? 'You’re subscribed to the Pearl of the Day. The next one arrives at about 7:00.'
          : `Check your inbox (${user.email}) to confirm the Pearl of the Day email.`,
      );
    } else {
      await backend.unsubscribeMe();
      useEmailToggle.setState({ state: 'off' });
      announce('The Pearl of the Day email is off.');
    }
  } catch {
    useEmailToggle.setState({ state: previous });
    announce('That didn’t work. Check your connection and try again.');
  }
}
