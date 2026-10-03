import { MOCK_DB_KEY, MOCK_EMAIL_KEY } from './storageKeys';
import { mergeProgress, type Progress } from '../../shared/mastery';
import { AccountError, type AccountErrorCode, type AccountUser, type AuthChange, type Backend, type EmailLinkResult, type SavedPearl, type SubscriptionStatus } from './types';
import { isEmailLink, readAuthUrl, urlNotice } from './urlState';

/**
 * In-browser stand-in for Supabase, used by the Playwright suite and the offline preview build.
 * State lives in localStorage so it survives reloads and in-app navigation, like a real session.
 * `window.__durarMock` exposes hooks tests use to act as the inbox and to simulate failures.
 */

interface MockUser {
  id: string;
  email: string;
  password: string;
  verified: boolean;
  provider: string;
  topic?: string | null;
}

interface MockDb {
  /** Mirrors the Supabase dashboard switches that change the flows. */
  settings?: { confirmEmail?: boolean; emailDelivery?: boolean };
  users: MockUser[];
  sessionUserId: string | null;
  saved: Record<string, SavedPearl[]>;
  progress?: Record<string, Progress[]>;
  outbox: { to: string; kind: 'verify' | 'reset' }[];
  /** The one-time links in those emails, like Supabase's token hashes. */
  links?: { hash: string; to: string; kind: 'verify' | 'reset'; used?: boolean }[];
}

type Op = keyof Backend;

const empty = (): MockDb => ({ users: [], sessionUserId: null, saved: {}, outbox: [] });

function load(): MockDb {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(MOCK_DB_KEY) ?? '{}') };
  } catch {
    return empty();
  }
}

function store(db: MockDb) {
  try {
    localStorage.setItem(MOCK_DB_KEY, JSON.stringify(db));
  } catch {
    /* storage unavailable: the mock simply forgets on reload */
  }
}

const toUser = (u: MockUser): AccountUser => ({ id: u.id, email: u.email, provider: u.provider, ...('topic' in u ? { topic: u.topic } : {}) });

/** Sends an auth email; a newer link of the same kind replaces the older ones, as in Supabase. */
function sendEmail(db: MockDb, to: string, kind: 'verify' | 'reset') {
  db.outbox.push({ to, kind });
  db.links ??= [];
  for (const l of db.links) if (l.to === to && l.kind === kind) l.used = true;
  db.links.push({ hash: crypto.randomUUID().replace(/-/g, ''), to, kind });
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMockBackend({ demo = false }: { demo?: boolean } = {}): Backend {
  const listeners = new Set<(c: AuthChange, u: AccountUser | null) => void>();
  const failures = new Map<string, AccountErrorCode>();
  const emit = (c: AuthChange, u: AccountUser | null) => listeners.forEach((l) => setTimeout(() => l(c, u), 0));

  async function step(op: Op) {
    await wait(120);
    const code = failures.get(op);
    if (code) {
      failures.delete(op);
      throw new AccountError(code, `mock failure: ${op}`);
    }
  }

  function current(db: MockDb): MockUser {
    const u = db.users.find((x) => x.id === db.sessionUserId);
    if (!u) throw new AccountError('unknown', 'not signed in');
    return u;
  }

  const hooks = {
    /** Acts as the user clicking the confirmation link in their inbox. */
    verify(email: string) {
      const db = load();
      const u = db.users.find((x) => x.email === email.toLowerCase());
      if (u && !u.verified) subscribeAccount(u.email);
      if (u) u.verified = true;
      store(db);
    },
    /** The address of the newest link emailed to `email`, as the templates build it. */
    link(email: string, kind: 'verify' | 'reset') {
      const l = load().links?.filter((x) => x.to === email.toLowerCase() && x.kind === kind).pop();
      return l ? `/?durar=${kind}&token_hash=${l.hash}` : null;
    },
    /** The next call to `op` fails with `code` (default: network). */
    failNext(op: Op, code: AccountErrorCode = 'network') {
      failures.set(op, code);
    },
    outbox: () => load().outbox,
    db: () => load(),
  };
  (window as unknown as { __durarMock: typeof hooks }).__durarMock = hooks;

  return {
    kind: 'mock',

    async init() {
      await step('init');
      const db = load();
      // Opening an emailed link, like supabaseBackend's verifyOtp: single use, starts a session.
      const urlState = readAuthUrl();
      let emailLink: EmailLinkResult | null = null;
      if (isEmailLink(urlState)) {
        const link = db.links?.find((l) => l.hash === urlState.tokenHash && l.kind === urlState.intent && !l.used);
        const owner = link && db.users.find((x) => x.email === link.to);
        if (link && owner) {
          for (const l of db.links!) if (l.to === link.to) l.used = true;
          if (link.kind === 'verify' && !owner.verified) subscribeAccount(owner.email);
          if (link.kind === 'verify') owner.verified = true;
          db.sessionUserId = owner.id;
          store(db);
          emit(link.kind === 'reset' ? 'password-recovery' : 'signed-in', toUser(owner));
          emailLink = 'ok';
        } else emailLink = 'failed';
      }
      const u = db.users.find((x) => x.id === db.sessionUserId);
      const user = u ? toUser(u) : null;
      return { user, notice: emailLink ? urlNotice(urlState, emailLink, user) : undefined };
    },

    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async signUp(email, password) {
      await step('signUp');
      if (password.length < 8) throw new AccountError('weak_password');
      const db = load();
      const confirmEmail = !demo && db.settings?.confirmEmail !== false;
      if (confirmEmail && db.settings?.emailDelivery === false) throw new AccountError('email_unavailable');
      const e = email.trim().toLowerCase();
      if (db.users.some((u) => u.email === e)) throw new AccountError('email_taken');
      const user = { id: crypto.randomUUID(), email: e, password, verified: !confirmEmail, provider: 'email' };
      db.users.push(user);
      if (!confirmEmail) {
        // “Confirm email” off (or a demo): the account is ready at once, like Supabase.
        db.sessionUserId = user.id;
        store(db);
        emit('signed-in', toUser(user));
        return { needsVerification: false };
      }
      sendEmail(db, e, 'verify');
      store(db);
      return { needsVerification: true };
    },

    async signIn(email, password) {
      await step('signIn');
      const db = load();
      const u = db.users.find((x) => x.email === email.trim().toLowerCase() && x.provider === 'email');
      if (!u || u.password !== password) throw new AccountError('invalid_credentials');
      if (!u.verified) throw new AccountError('email_not_confirmed');
      db.sessionUserId = u.id;
      store(db);
      emit('signed-in', toUser(u));
      return toUser(u);
    },

    async signInWithGoogle() {
      await step('signInWithGoogle');
      const db = load();
      let u = db.users.find((x) => x.provider === 'google');
      if (!u) {
        u = { id: crypto.randomUUID(), email: 'pearl.diver@gmail.com', password: '', verified: true, provider: 'google' };
        db.users.push(u);
        subscribeAccount(u.email);
      }
      db.sessionUserId = u.id;
      store(db);
      emit('signed-in', toUser(u));
    },

    async signOut() {
      await step('signOut');
      const db = load();
      db.sessionUserId = null;
      store(db);
      emit('signed-out', null);
    },

    async requestPasswordReset(email) {
      await step('requestPasswordReset');
      const db = load();
      if (db.settings?.emailDelivery === false) throw new AccountError('email_unavailable');
      // Same answer whether or not the address exists, like the real service.
      if (db.users.some((u) => u.email === email.trim().toLowerCase())) sendEmail(db, email.trim().toLowerCase(), 'reset');
      store(db);
    },

    async updatePassword(password) {
      await step('updatePassword');
      if (password.length < 8) throw new AccountError('weak_password');
      const db = load();
      const u = current(db);
      if (u.password === password) throw new AccountError('same_password');
      u.password = password;
      store(db);
    },

    async setTopic(topic) {
      await step('setTopic');
      const db = load();
      current(db).topic = topic;
      store(db);
    },

    async resendVerification(email) {
      await step('resendVerification');
      const db = load();
      if (db.settings?.emailDelivery === false) throw new AccountError('email_unavailable');
      sendEmail(db, email.trim().toLowerCase(), 'verify');
      store(db);
    },

    async listSaved() {
      await step('listSaved');
      const db = load();
      return [...(db.saved[current(db).id] ?? [])].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    },

    async save(slug, savedAt) {
      await step('save');
      const db = load();
      const list = (db.saved[current(db).id] ??= []);
      if (!list.some((p) => p.slug === slug)) list.push({ slug, savedAt: savedAt ?? new Date().toISOString() });
      store(db);
    },

    async unsave(slug) {
      await step('unsave');
      const db = load();
      const id = current(db).id;
      db.saved[id] = (db.saved[id] ?? []).filter((p) => p.slug !== slug);
      store(db);
    },

    async listProgress() {
      await step('listProgress');
      const db = load();
      return [...(db.progress?.[current(db).id] ?? [])];
    },

    async saveProgress(rows) {
      await step('saveProgress');
      const db = load();
      const id = current(db).id;
      const byslug = new Map((db.progress?.[id] ?? []).map((p) => [p.slug, p]));
      // The same rule as save_progress(): the latest review wins, lapses and times seen never go down.
      for (const r of rows) {
        const prev = byslug.get(r.slug);
        const win = mergeProgress(prev, r)!;
        byslug.set(r.slug, prev ? { ...win, lapses: Math.max(prev.lapses, r.lapses), timesSeen: Math.max(prev.timesSeen, r.timesSeen) } : r);
      }
      db.progress = { ...db.progress, [id]: [...byslug.values()] };
      store(db);
    },

    async resetProgress() {
      await step('resetProgress');
      const db = load();
      db.progress = { ...db.progress, [current(db).id]: [] };
      store(db);
    },

    async accessToken() {
      const db = load();
      const u = db.users.find((x) => x.id === db.sessionUserId);
      return u ? `mock:${u.provider}:${u.email}` : null;
    },

    async getSubscription() {
      await step('getSubscription');
      const email = current(load()).email;
      return (readMockEmail()[email] ?? 'none') as SubscriptionStatus;
    },

    async unsubscribeMe() {
      await step('unsubscribeMe');
      const email = current(load()).email;
      writeMockEmail({ ...readMockEmail(), [email]: 'unsubscribed' });
    },

    async deleteAccount() {
      await step('deleteAccount');
      const db = load();
      const id = current(db).id;
      const { [current(db).email]: _gone, ...rest } = readMockEmail();
      void _gone;
      writeMockEmail(rest);
      db.users = db.users.filter((u) => u.id !== id);
      delete db.saved[id];
      if (db.progress) delete db.progress[id]; // like the cascade from auth.users
      db.sessionUserId = null;
      store(db);
      emit('signed-out', null);
    },
  };
}

/**
 * Like the database trigger: an account whose address was just proven (confirmation link or Google)
 * gets the daily email, unless that address already opted out, bounced or complained.
 */
function subscribeAccount(email: string) {
  const m = readMockEmail();
  if (!m[email] || m[email] === 'pending') writeMockEmail({ ...m, [email]: 'confirmed' });
}

/** Mock email subscriptions (email → status), shared with src/lib/emailApi.ts in mock mode. */
export function readMockEmail(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MOCK_EMAIL_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function writeMockEmail(v: Record<string, string>) {
  try {
    localStorage.setItem(MOCK_EMAIL_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
