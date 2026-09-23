import { MOCK_DB_KEY } from './storageKeys';
import { AccountError, type AccountErrorCode, type AccountUser, type AuthChange, type Backend, type SavedPearl } from './types';

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
}

interface MockDb {
  users: MockUser[];
  sessionUserId: string | null;
  saved: Record<string, SavedPearl[]>;
  outbox: { to: string; kind: 'verify' | 'reset' }[];
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

const toUser = (u: MockUser): AccountUser => ({ id: u.id, email: u.email, provider: u.provider });
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
      if (u) u.verified = true;
      store(db);
    },
    /** Acts as the user opening a password-reset link: a recovery session starts. */
    recover(email: string) {
      const db = load();
      const u = db.users.find((x) => x.email === email.toLowerCase());
      if (!u) return;
      db.sessionUserId = u.id;
      store(db);
      emit('password-recovery', toUser(u));
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
      const u = db.users.find((x) => x.id === db.sessionUserId);
      return { user: u ? toUser(u) : null };
    },

    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async signUp(email, password) {
      await step('signUp');
      if (password.length < 8) throw new AccountError('weak_password');
      const db = load();
      const e = email.trim().toLowerCase();
      if (db.users.some((u) => u.email === e)) throw new AccountError('email_taken');
      const user = { id: crypto.randomUUID(), email: e, password, verified: demo, provider: 'email' };
      db.users.push(user);
      if (demo) {
        // No inbox in a demo: the account is ready at once.
        db.sessionUserId = user.id;
        store(db);
        emit('signed-in', toUser(user));
        return { needsVerification: false };
      }
      db.outbox.push({ to: e, kind: 'verify' });
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
      // Same answer whether or not the address exists, like the real service.
      if (db.users.some((u) => u.email === email.trim().toLowerCase())) db.outbox.push({ to: email.trim().toLowerCase(), kind: 'reset' });
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

    async resendVerification(email) {
      await step('resendVerification');
      const db = load();
      db.outbox.push({ to: email.trim().toLowerCase(), kind: 'verify' });
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

    async deleteAccount() {
      await step('deleteAccount');
      const db = load();
      const id = current(db).id;
      db.users = db.users.filter((u) => u.id !== id);
      delete db.saved[id];
      db.sessionUserId = null;
      store(db);
      emit('signed-out', null);
    },
  };
}
