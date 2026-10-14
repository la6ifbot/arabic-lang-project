import { MOCK_DB_KEY, MOCK_EMAIL_KEY } from './storageKeys';
import { applyMerge, applyReview, deepScore, generatedName, nameKey, nameShapeProblem, weekStart, type ServerRow } from '../../shared/deep';
import { DAY_MS, type Progress } from '../../shared/mastery';
import {
  AccountError,
  type AccountErrorCode,
  type AccountUser,
  type AuthChange,
  type Backend,
  type BoardRow,
  type DeepMe,
  type DeepScript,
  type EmailLinkResult,
  type MyData,
  type SavedPearl,
  type SubscriptionStatus,
} from './types';
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
  createdAt?: string;
}

interface MockDb {
  /** Mirrors the Supabase dashboard switches that change the flows. */
  settings?: { confirmEmail?: boolean; emailDelivery?: boolean };
  users: MockUser[];
  sessionUserId: string | null;
  saved: Record<string, SavedPearl[]>;
  /** Rows as the server keeps them (verifiedBox / verifiedAt may be missing on old seeds: unverified). */
  progress?: Record<string, (Progress & Partial<ServerRow>)[]>;
  /** The Deep: members by user id, other divers for the boards, and each user's depth changes (for This week). */
  deep?: {
    members: Record<string, { name: string; generated: boolean; joinedAt: string; renamedAt: string | null }>;
    divers?: { name: string; depth: number; pearls: number; week: number; at: string }[];
    log?: Record<string, { at: string; d: number }[]>;
  };
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

const asServerRow = (p: Progress & Partial<ServerRow>): ServerRow => ({ verifiedBox: 0, verifiedAt: null, ...p });
const asProgressRow = ({ slug, box, dueAt, lastReviewedAt, timesSeen, lapses }: Progress): Progress => ({ slug, box, dueAt, lastReviewedAt, timesSeen, lapses });

/** Like the deep_scores trigger: remembers each change of verified depth. */
function logDepth(db: MockDb, id: string, d: number, now: number) {
  if (!d) return;
  db.deep ??= { members: {} };
  db.deep.log ??= {};
  (db.deep.log[id] ??= []).push({ at: new Date(now).toISOString(), d });
}

interface Entry {
  id: string | null;
  name: string;
  depth: number;
  pearls: number;
  week: number;
  at: string;
  weekAt: string;
}

/** Everyone on The Deep with their scores, computed live (the database rebuilds this every 15 minutes). */
function deepEntries(db: MockDb, now: number): Entry[] {
  const wk = weekStart(now);
  const out: Entry[] = (db.deep?.divers ?? []).map((d) => ({ id: null, ...d, weekAt: d.at }));
  for (const [id, m] of Object.entries(db.deep?.members ?? {})) {
    const { depth, pearls } = deepScore((db.progress?.[id] ?? []).map(asServerRow));
    const log = db.deep?.log?.[id] ?? [];
    const thisWeek = log.filter((e) => weekStart(Date.parse(e.at)) === wk);
    out.push({
      id,
      name: m.name,
      depth,
      pearls,
      week: thisWeek.reduce((n, e) => n + e.d, 0),
      at: log.at(-1)?.at ?? m.joinedAt,
      weekAt: thisWeek.at(-1)?.at ?? m.joinedAt,
    });
  }
  return out;
}

function rankBoard(entries: Entry[], board: 'week' | 'all'): (BoardRow & { id: string | null })[] {
  const score = (e: Entry) => (board === 'week' ? e.week : e.depth);
  const at = (e: Entry) => (board === 'week' ? e.weekAt : e.at);
  return entries
    .filter((e) => score(e) > 0)
    .sort((a, b) => score(b) - score(a) || at(a).localeCompare(at(b)) || nameKey(a.name).localeCompare(nameKey(b.name)))
    .map((e, i) => ({ id: e.id, rank: i + 1, name: e.name, score: score(e), pearls: board === 'all' ? e.pearls : null }));
}

const RESERVED = new Set(['durar', 'درر', 'the deep', 'deep', 'admin', 'administrator', 'moderator', 'support', 'staff', 'diver', 'غواص']);
const BLOCKED = ['fuck', 'shit', 'cunt', 'bitch', 'whore'];

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

  function deepMe(db: MockDb): DeepMe | null {
    const id = current(db).id;
    const m = db.deep?.members[id];
    if (!m) return null;
    const now = Date.now();
    const entries = deepEntries(db, now);
    const mine = entries.find((e) => e.id === id)!;
    const all = rankBoard(entries, 'all').find((r) => r.id === id);
    const week = rankBoard(entries, 'week').find((r) => r.id === id);
    const next = m.renamedAt ? Date.parse(m.renamedAt) + DAY_MS : 0;
    return {
      name: m.name,
      generated: m.generated,
      joinedAt: m.joinedAt,
      nextRenameAt: next > now ? new Date(next).toISOString() : null,
      live: { depth: mine.depth, pearls: mine.pearls, week: Math.max(mine.week, 0) },
      all: all ? { rank: all.rank, score: all.score, pearls: all.pearls } : null,
      week: week ? { rank: week.rank, score: week.score } : null,
    };
  }

  function deepExport(db: MockDb, id: string) {
    const m = db.deep?.members[id];
    if (!m) return null;
    const mine = deepEntries(db, Date.now()).find((e) => e.id === id)!;
    return {
      name: m.name,
      generated_name: m.generated,
      joined_at: m.joinedAt,
      renamed_at: m.renamedAt,
      depth: mine.depth,
      pearls_in_the_deep: mine.pearls,
      depth_gained_this_week: mine.week,
    };
  }

  /** deep_name_problem() in short: the shared shape rules, a few reserved and blocked names, and uniqueness. */
  function checkName(db: MockDb, name: string | null, script: DeepScript, id: string): string {
    const taken = (n: string) =>
      Object.entries(db.deep?.members ?? {}).some(([uid, m]) => uid !== id && nameKey(m.name) === nameKey(n)) ||
      (db.deep?.divers ?? []).some((d) => nameKey(d.name) === nameKey(n));
    if (name === null) {
      for (;;) {
        const n = generatedName(1 + Math.floor(Math.random() * 999), script);
        if (!taken(n)) return n;
      }
    }
    const clean = name.trim().normalize('NFC').replace(/\s+/g, ' ');
    const problem = nameShapeProblem(clean);
    if (problem) throw new AccountError(`name_${problem}` as AccountErrorCode);
    if (RESERVED.has(nameKey(clean))) throw new AccountError('name_reserved');
    if (BLOCKED.some((w) => nameKey(clean).replace(/[^a-z]/g, '').includes(w))) throw new AccountError('name_not_allowed');
    if (taken(clean)) throw new AccountError('name_taken');
    return clean;
  }

  // The Turnstile tokens each request carried, newest last, so tests can check they were sent.
  const captchas: { op: Op; token: string | null }[] = [];

  const hooks = {
    captchas: () => captchas.slice(),
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
    /** Other divers on The Deep, for the boards. */
    divers(list: { name: string; depth: number; pearls: number; week: number; at: string }[]) {
      const db = load();
      db.deep ??= { members: {} };
      db.deep.divers = list;
      store(db);
    },
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

    async signUp(email, password, _returnTo, captchaToken) {
      captchas.push({ op: 'signUp', token: captchaToken ?? null });
      await step('signUp');
      if (password.length < 8) throw new AccountError('weak_password');
      const db = load();
      const confirmEmail = !demo && db.settings?.confirmEmail !== false;
      if (confirmEmail && db.settings?.emailDelivery === false) throw new AccountError('email_unavailable');
      const e = email.trim().toLowerCase();
      if (db.users.some((u) => u.email === e)) throw new AccountError('email_taken');
      const user = { id: crypto.randomUUID(), email: e, password, verified: !confirmEmail, provider: 'email', createdAt: new Date().toISOString() };
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

    async signIn(email, password, captchaToken) {
      captchas.push({ op: 'signIn', token: captchaToken ?? null });
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
        u = { id: crypto.randomUUID(), email: 'pearl.diver@gmail.com', password: '', verified: true, provider: 'google', createdAt: new Date().toISOString() };
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

    async requestPasswordReset(email, _returnTo, captchaToken) {
      captchas.push({ op: 'requestPasswordReset', token: captchaToken ?? null });
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

    async resendVerification(email, _returnTo, captchaToken) {
      captchas.push({ op: 'resendVerification', token: captchaToken ?? null });
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
      return (db.progress?.[current(db).id] ?? []).map(asProgressRow);
    },

    async saveProgress(rows) {
      await step('saveProgress');
      const db = load();
      const id = current(db).id;
      const byslug = new Map((db.progress?.[id] ?? []).map((p) => [p.slug, asServerRow(p)]));
      // The same rule as save_progress(): the latest review wins, and nothing new counts on The Deep.
      for (const r of rows) {
        const prev = byslug.get(r.slug);
        const next = applyMerge(prev, r);
        logDepth(db, id, next.verifiedBox - (prev?.verifiedBox ?? 0), Date.now());
        byslug.set(r.slug, next);
      }
      db.progress = { ...db.progress, [id]: [...byslug.values()] };
      store(db);
    },

    async recordReviews(reviews) {
      await step('recordReviews');
      const db = load();
      const id = current(db).id;
      const now = Date.now();
      const byslug = new Map((db.progress?.[id] ?? []).map((p) => [p.slug, asServerRow(p)]));
      const out: Progress[] = [];
      for (const r of reviews) {
        const prev = byslug.get(r.slug);
        const { row } = applyReview(prev, r.slug, r.dir, now);
        logDepth(db, id, row.verifiedBox - (prev?.verifiedBox ?? 0), now);
        byslug.set(r.slug, row);
        out.push(asProgressRow(row));
      }
      db.progress = { ...db.progress, [id]: [...byslug.values()] };
      store(db);
      return out;
    },

    async deepBoards() {
      await step('deepBoards');
      const entries = deepEntries(load(), Date.now());
      const board = (b: 'week' | 'all') => {
        const rows = rankBoard(entries, b);
        return { rows: rows.slice(0, 10).map(({ id: _id, ...r }) => r), divers: rows.length };
      };
      return { week: board('week'), all: board('all'), refreshedAt: new Date().toISOString() };
    },

    async deepMe() {
      await step('deepMe');
      return deepMe(load());
    },

    async deepJoin(name, script) {
      await step('deepJoin');
      const db = load();
      const id = current(db).id;
      if (!db.deep?.members[id]) {
        const v = checkName(db, name, script, id);
        db.deep ??= { members: {} };
        db.deep.members[id] = { name: v, generated: name === null, joinedAt: new Date().toISOString(), renamedAt: null };
        store(db);
      }
      return deepMe(db)!;
    },

    async deepRename(name, script) {
      await step('deepRename');
      const db = load();
      const id = current(db).id;
      const m = db.deep?.members[id];
      if (!m) throw new AccountError('unknown', 'not in the deep');
      if (m.renamedAt && Date.parse(m.renamedAt) > Date.now() - DAY_MS) throw new AccountError('rename_too_soon');
      db.deep!.members[id] = { ...m, name: checkName(db, name, script, id), generated: name === null, renamedAt: new Date().toISOString() };
      store(db);
      return deepMe(db)!;
    },

    async deepLeave() {
      await step('deepLeave');
      const db = load();
      if (db.deep) delete db.deep.members[current(db).id];
      store(db);
    },

    async resetProgress() {
      await step('resetProgress');
      const db = load();
      const id = current(db).id;
      logDepth(db, id, -deepScore((db.progress?.[id] ?? []).map(asServerRow)).depth, Date.now());
      db.progress = { ...db.progress, [id]: [] };
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

    async exportMyData(): Promise<MyData> {
      await step('exportMyData');
      const db = load();
      const u = current(db);
      const status = readMockEmail()[u.email];
      return {
        account: { email: u.email, created_at: u.createdAt ?? null, sign_in_method: u.provider, sea_topic: u.topic },
        saved_pearls: (db.saved[u.id] ?? []).map((p) => ({ word: p.slug, saved_at: p.savedAt })),
        progress: (db.progress?.[u.id] ?? []).map((p) => ({
          word: p.slug,
          box: p.box,
          due_at: p.dueAt,
          last_reviewed_at: p.lastReviewedAt,
          times_seen: p.timesSeen,
          lapses: p.lapses,
        })),
        email_subscription: status ? { email: u.email, status, subscribed_at: null, confirmed_at: null, unsubscribed_at: null } : null,
        the_deep: deepExport(db, u.id),
      };
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
      if (db.deep) {
        delete db.deep.members[id];
        delete db.deep.log?.[id];
      }
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
