import { asProgress, isDue, mergeProgress, returnsIn, review, type Progress } from '../../shared/mastery';
import { accountsMode } from '../account/backend';
import { bootAccounts, useAccount } from '../account/store';
import { PROGRESS_KEY, PROGRESS_OUTBOX_KEY, SEA_DEPTH_KEY } from '../account/storageKeys';
import { WORDS } from '../lib/words';
import { useProgress } from '../state/progress';
import { swipeHook, useDurar, type SwipeEvent } from '../state/store';
import { isFresh, knownShare, metEveryPearl, planOrder, seaDeepening, settleOrder } from './queue';

/**
 * The progress engine (lazy chunk). Signed in, progress lives in the database: saved
 * optimistically, in short batches, with keepalive and a quiet retry when offline. Signed out, it
 * lives in this browser only. On sign-in the browser copy merges into the account (the latest
 * review of each word wins) and is then cleared.
 */

const LIVE = WORDS.map((w) => w.slug);
/** Browser copy cap (the word list is far smaller). */
const GUEST_CAP = 2000;
const BATCH_MS = 700;

type PMap = Record<string, Progress>;

// ---------------------------------------------------------------------------------------------
// Browser storage. Every read and write is wrapped: private mode must never break the site.

interface Guest {
  seed: string;
  items: Progress[];
}

const newSeed = () => Math.random().toString(36).slice(2, 10);

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: progress just won't outlive this visit */
  }
}

const rows = (v: unknown): Progress[] => (Array.isArray(v) ? v.map(asProgress).filter((p): p is Progress => p !== null) : []);

function readGuest(): Guest {
  const v = readJson(PROGRESS_KEY) as { seed?: unknown; items?: unknown } | null;
  return { seed: typeof v?.seed === 'string' ? v.seed : newSeed(), items: rows(v?.items) };
}

function writeGuest(seed: string, map: PMap) {
  const items = Object.values(map)
    .sort((a, b) => b.lastReviewedAt.localeCompare(a.lastReviewedAt))
    .slice(0, GUEST_CAP);
  writeJson(PROGRESS_KEY, { v: 1, seed, items });
}

function readOutbox(userId: string): Progress[] {
  const v = readJson(PROGRESS_OUTBOX_KEY) as { user?: unknown; items?: unknown } | null;
  return v?.user === userId ? rows(v.items) : [];
}

// ---------------------------------------------------------------------------------------------
// State

/** Signed-in user id, or null for this browser. `undefined` until the first load. */
let owner: string | null | undefined;
let seed = '';
/** Words whose box already moved this visit: in-session comebacks never move it again. */
const counted = new Set<string>();
/** New words shown since the last due one (keeps the 1-in-3 rhythm across rebuilds). */
let sinceDue = 0;
let loading: Promise<void> | null = null;

const set = useProgress.setState;
const map = () => useProgress.getState().map;

// ---------------------------------------------------------------------------------------------
// Saving (signed in): optimistic, batched, retried quietly.

const outbox = new Map<string, Progress>();
let timer = 0;
let retry = 0;

function persistOutbox() {
  if (owner) writeJson(PROGRESS_OUTBOX_KEY, outbox.size ? { user: owner, items: [...outbox.values()] } : null);
}

function queueSave(p: Progress) {
  outbox.set(p.slug, p);
  persistOutbox();
  schedule(BATCH_MS);
}

function schedule(ms: number) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void flush(), ms);
}

async function flush() {
  window.clearTimeout(timer);
  if (!owner || !outbox.size) return;
  const user = owner;
  const batch = [...outbox.values()];
  outbox.clear();
  try {
    const backend = await bootAccounts();
    if (!backend || useAccount.getState().user?.id !== user) throw new Error('not signed in');
    await backend.saveProgress(batch);
    retry = 0;
  } catch {
    // Put back anything not replaced by a newer swipe meanwhile, and try again later.
    for (const p of batch) if (!outbox.has(p.slug)) outbox.set(p.slug, p);
    retry = Math.min(Math.max(retry * 2, 2000), 60_000);
    if (owner === user) schedule(retry);
  } finally {
    if (owner === user) persistOutbox();
  }
}

// ---------------------------------------------------------------------------------------------
// Loading and merging

async function load() {
  // Unsaved rows belong to whoever was signed in; they wait in storage under that account.
  window.clearTimeout(timer);
  outbox.clear();
  if (accountsMode !== 'off' && useAccount.getState().status === 'loading') await bootAccounts();
  const { status, user } = useAccount.getState();
  let next: PMap = {};
  if (status === 'signed-in' && user) {
    const backend = await bootAccounts();
    try {
      for (const p of (await backend?.listProgress()) ?? []) next[p.slug] = p;
    } catch (e) {
      console.warn('Durar: could not load progress.', e);
    }
    owner = user.id;
    seed = user.id;
    // Merge: anything this browser holds (as a guest, or unsaved from an earlier visit) that is
    // newer than the account's copy wins, and is saved to the account.
    const guest = readGuest().items;
    for (const p of [...readOutbox(user.id), ...guest]) {
      if (mergeProgress(next[p.slug], p) === p) {
        next[p.slug] = p;
        outbox.set(p.slug, p);
      }
    }
    persistOutbox();
    if (guest.length) writeJson(PROGRESS_KEY, null);
    if (outbox.size) void flush();
  } else {
    owner = null;
    const g = readGuest();
    seed = g.seed;
    for (const p of g.items) next[p.slug] = mergeProgress(next[p.slug], p)!;
  }
  // Swipes made while this was loading still count.
  set({ map: next, loaded: true });
  const early = swipeHook.early.splice(0);
  for (const e of early) record(e, false);
  rebuild();
  const deep = seaDeepening(knownShare(LIVE, map()));
  set({ deep });
  writeJson(SEA_DEPTH_KEY, deep);
}

function reload() {
  loading = load().finally(() => {
    loading = null;
  });
  return loading;
}

/** Recomputes the whole queue behind the focused card. */
function rebuild() {
  const { order, reviews } = useDurar.getState();
  const returning = new Set(Object.keys(reviews));
  const now = Date.now();
  const next = planOrder({ slugs: LIVE, progress: map(), order, returning, seed, now, sinceDue });
  useDurar.setState({ order: next });
  set({ metAll: metEveryPearl(next, map(), returning, now) });
}

// ---------------------------------------------------------------------------------------------
// Swipes

/** Applies the box rules to one swipe and saves it. */
function record(e: SwipeEvent, announce = true) {
  const prev = map()[e.slug];
  const moves =
    !e.returning &&
    (e.dir === 'known' ? !counted.has(e.slug) && isFresh(prev, e.at) : !counted.has(e.slug) || (prev?.box ?? 1) > 1);
  let p = prev;
  if (moves) {
    counted.add(e.slug);
    p = review(e.slug, prev, e.dir, e.at);
    set({ map: { ...map(), [e.slug]: p } });
    if (owner) queueSave(p);
    else writeGuest(seed, map());
  }
  if (announce && p) {
    const when = returnsIn(p, e.at);
    const text = e.dir === 'known' ? `Marked known · returns ${when}` : `Still learning · back ${when}`;
    set((s) => ({ note: { text, id: s.note.id + 1 } }));
  }
}

function onSwipe(e: SwipeEvent) {
  if (loading || owner === undefined) {
    swipeHook.early.push(e);
    return;
  }
  const next = useDurar.getState().order[0];
  const nextProgress = map()[next];
  record(e);
  const { order, reviews } = useDurar.getState();
  const returning = new Set(Object.keys(reviews));
  const now = Date.now();
  const settled = settleOrder(order, map(), returning, now);
  useDurar.setState({ order: settled });
  set({ metAll: metEveryPearl(settled, map(), returning, now) });
  if (!nextProgress) sinceDue++;
  else if (isDue(nextProgress, now)) sinceDue = 0;
}

// ---------------------------------------------------------------------------------------------
// Public

let started = false;

export async function start() {
  if (started) return loading ?? undefined;
  started = true;
  await reload();
  swipeHook.after = onSwipe;
  // Sign-in (any route: password, Google, an email link), sign-out and account deletion.
  useAccount.subscribe((s) => {
    const id = s.status === 'signed-in' ? (s.user?.id ?? null) : s.status === 'signed-out' ? null : undefined;
    if (id === undefined || id === owner) return;
    void flush().then(reload);
  });
  window.addEventListener('online', () => void flush());
  // Leaving the page: send what's waiting (the requests use keepalive).
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}

/** Clears progress everywhere: the account (if signed in) and this browser. Saved pearls stay. */
export async function reset() {
  if (loading) await loading;
  if (owner) {
    const backend = await bootAccounts();
    if (!backend) throw new Error('network: accounts backend unavailable');
    window.clearTimeout(timer);
    outbox.clear();
    await backend.resetProgress();
    writeJson(PROGRESS_OUTBOX_KEY, null);
  }
  writeJson(PROGRESS_KEY, null);
  if (!owner) seed = newSeed();
  counted.clear();
  set({ map: {}, deep: 0 });
  writeJson(SEA_DEPTH_KEY, null);
  rebuild();
}
