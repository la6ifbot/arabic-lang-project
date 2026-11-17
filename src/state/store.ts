import { create } from 'zustand';
import { onNavigate, slugFromPath, topicFromPath } from '../lib/router';
import { prefersReducedMotion } from '../lib/device';
import { topicSlugs } from '../lib/topics';
import { TODAY, WORD_BY_SLUG } from '../lib/words';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_FIT } from '../lib/zoom';
import type { DragMode } from '../lib/swipeGesture';

/** How many turned-away words “Previous” can step back through. */
export const HISTORY_MAX = 30;
/** How long a departing (“I know it”) card keeps rendering while it rises, then sinks. */
export const EXIT_MS = 3400;
/** How long “Undo” stays after “I know it” (decision 4). The engine holds that review back as long. */
export const UNDO_MS = 5000;

export interface Departure {
  slug: string;
  at: number;
}

/** Cards the 3D scene is drawing in the rotation right now (written by CardField). */
export const sceneCards = { visible: [] as string[] };

/**
 * “I know it”, as the progress engine sees it. Next and previous never reach the engine: they don't
 * change progress. `returning` stays for the engine's rules and is always false now.
 */
export interface SwipeEvent {
  slug: string;
  dir: 'known';
  returning: boolean;
  /** Date.now() at the swipe. */
  at: number;
}

/**
 * Set by the progress engine once it loads (a lazy chunk). Swipes before that are kept in `early`
 * and replayed, so none is lost while the engine is still on its way. `undo` takes one back.
 */
export const swipeHook: { after: ((e: SwipeEvent) => void) | null; undo: ((slug: string) => void) | null; early: SwipeEvent[] } = {
  after: null,
  undo: null,
  early: [],
};

/** The card just turned away: by next (+1, it glides right) or previous (-1, it glides left). */
export interface Turn {
  slug: string;
  dir: 1 | -1;
  at: number;
}

export interface Motion {
  slug: string;
  at: number;
}

interface DurarState {
  /** Rotation queue; order[0] is the focused card. */
  order: string[];
  departures: Departure[];
  /** The card last turned away by next or previous (drives its glide aside). */
  turn: Turn | null;
  /** Card currently rising from the depths after a search. */
  surfacing: Motion | null;
  /** Next, previous and “I know it” this visit. */
  swipes: number;
  /** The last “I know it” while it can still be undone (`at`: Date.now() at the swipe). */
  known: { slug: string; at: number } | null;
  textMode: boolean;
  /** The chosen topic's id, or null for the whole sea. The rotation only holds its words. */
  topic: string | null;
  /** When the topic last changed (performance.now()), for the switch choreography. */
  switchedAt: number;
  /** Words turned away this visit, oldest first: “Previous” brings the last one back into focus. */
  history: string[];
  /** Swipe right, ← or Next: the next card. Progress doesn't change; a due word stays due. */
  next: () => void;
  /** Swipe left, →, Previous or Backspace: the last word comes back (an answer given stays counted). */
  previous: () => void;
  /** Swipe up, ↑ or the button: the card rises, then sinks; the server's rules decide if it moves deeper. */
  know: () => void;
  /** Takes back the last “I know it” within UNDO_MS: the card comes back and its review is never sent. */
  undo: () => void;
  /** Switches the sea to a topic (null: the whole sea): its cards rise as the current ones sink. */
  setTopic: (topic: string | null) => void;
  surface: (slug: string) => void;
  setTextMode: (on: boolean) => void;
}

function dailyShuffle(slugs: string[]): string[] {
  // Deterministic per day, so the sea looks different each day but stable within a visit.
  let seed = Math.floor(Date.now() / 86_400_000) * 2654435761;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const a = [...slugs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function initialOrder(startSlug: string | null, topic: string | null = null): string[] {
  // Deep links open on their word; everything else opens on today's Pearl of the Day.
  const first = startSlug && WORD_BY_SLUG.has(startSlug) ? startSlug : TODAY.slug;
  const rest = dailyShuffle(topicSlugs(topic).filter((s) => s !== first));
  return [first, ...rest];
}

/** The order after switching to a topic: today's pearl first when it belongs there. */
export function topicOrder(topic: string | null): string[] {
  const slugs = topicSlugs(topic);
  const shuffled = dailyShuffle(slugs);
  const first = slugs.includes(TODAY.slug) ? TODAY.slug : shuffled[0];
  return [first, ...shuffled.filter((s) => s !== first)];
}

export const useDurar = create<DurarState>((set, get) => ({
  order: initialOrder(null),
  topic: null,
  switchedAt: 0,
  departures: [],
  turn: null,
  surfacing: null,
  swipes: 0,
  known: null,
  history: [],
  textMode: false,

  next: () => {
    const { order, history, swipes } = get();
    if (order.length < 2) return;
    const [current, ...rest] = order;
    set({
      order: [...rest, current],
      history: [...history.filter((h) => h !== current), current].slice(-HISTORY_MAX),
      turn: { slug: current, dir: 1, at: performance.now() },
      surfacing: null,
      swipes: swipes + 1,
    });
  },

  previous: () => {
    const { history, order, departures, swipes } = get();
    const last = history[history.length - 1];
    if (!last) return;
    set({
      history: history.slice(0, -1),
      order: [last, ...order.filter((s) => s !== last)],
      turn: order[0] !== last ? { slug: order[0], dir: -1, at: performance.now() } : null,
      departures: departures.filter((d) => d.slug !== last),
      surfacing: null,
      swipes: swipes + 1,
    });
  },

  know: () => {
    const { order, departures, swipes, history } = get();
    if (order.length < 2) return;
    const now = performance.now();
    const [current, ...rest] = order;
    const event: SwipeEvent = { slug: current, dir: 'known', returning: false, at: Date.now() };
    set({
      order: [...rest, current],
      departures: [...departures.filter((d) => now - d.at < EXIT_MS && d.slug !== current), { slug: current, at: now }],
      history: [...history.filter((h) => h !== current), current].slice(-HISTORY_MAX),
      known: { slug: current, at: event.at },
      turn: null,
      swipes: swipes + 1,
      surfacing: null,
    });
    if (swipeHook.after) swipeHook.after(event);
    else swipeHook.early.push(event);
  },

  undo: () => {
    const { known, order, departures, history } = get();
    if (!known || Date.now() - known.at > UNDO_MS) return;
    const { slug } = known;
    // The card glides back up from wherever its sink has got to.
    set({
      known: null,
      order: [slug, ...order.filter((s) => s !== slug)],
      departures: departures.filter((d) => d.slug !== slug),
      history: history.filter((h) => h !== slug),
      turn: null,
      surfacing: null,
    });
    const early = swipeHook.early.findIndex((e) => e.slug === slug && e.at === known.at);
    if (early >= 0) swipeHook.early.splice(early, 1);
    else swipeHook.undo?.(slug);
  },

  surface: (slug) => {
    const { order, departures } = get();
    if (!WORD_BY_SLUG.has(slug) || order[0] === slug) return;
    set({
      order: [slug, ...order.filter((s) => s !== slug)],
      surfacing: { slug, at: performance.now() },
      departures: departures.filter((d) => d.slug !== slug),
    });
  },

  setTopic: (topic) => {
    const { order, departures, topic: current } = get();
    if (topic === current) return;
    const now = performance.now();
    const next = topicOrder(topic);
    // Every card on screen that isn't staying sinks away; the topic's first pearl rises.
    const leaving = (sceneCards.visible.length ? sceneCards.visible : order.slice(0, 1)).filter((s) => !next.slice(0, 12).includes(s));
    set({
      topic,
      switchedAt: now,
      order: next,
      history: [],
      known: null,
      turn: null,
      // Reduced motion: no rise from the deep; the new cards fade in where they belong.
      surfacing: next[0] === order[0] || prefersReducedMotion() ? null : { slug: next[0], at: now },
      departures: [...departures.filter((d) => now - d.at < EXIT_MS && !leaving.includes(d.slug)), ...leaving.map((slug) => ({ slug, at: now }))],
    });
  },

  setTextMode: (textMode) => set({ textMode }),
}));

// Arriving at /word/<slug> from inside the app (Library, back button): that pearl rises into focus,
// in the whole sea. /sea/<topic> and / choose the topic (back and forward included).
onNavigate((route, path) => {
  if (route.name !== 'scene') return;
  const slug = slugFromPath(path);
  const { setTopic, surface } = useDurar.getState();
  setTopic(slug ? null : topicFromPath(path));
  if (slug) surface(slug);
});

/** High-frequency input state, kept out of React to avoid re-rendering at pointer rate. */
export const gesture = {
  /** Horizontal drag offset of the focused card, in CSS pixels (right = next, left = previous). */
  dragPx: 0,
  /** Upward drag offset (≤ 0) toward “I know it”, in CSS pixels. */
  dragPy: 0,
  /** What the current drag is (src/lib/swipeGesture.ts), for the drag label. */
  mode: 'undecided' as DragMode,
  dragging: false,
  /** Pointer position in normalized device coords, for subtle camera parallax. */
  px: 0,
  py: 0,
  /** Pinch zoom of the focused card (1 = normal size); kept until pinched back or the card changes. */
  zoom: 1,
  /** True while two fingers are on the card, so it follows them without easing lag. */
  pinching: false,
  /** Vertical offset of an enlarged card, in CSS pixels (drag up/down to see its top and bottom). */
  panPx: 0,
  /** Largest zoom at which the focused card's widest line still fits the screen; set by the card. */
  maxZoom: 1.8,
  /** The element taking the gestures; mirrors the zoom state as data attributes (read by tests). */
  el: null as HTMLElement | null,
};

export { MAX_ZOOM, MIN_ZOOM, ZOOM_FIT };

const mirror = (key: string, value: string | null) => {
  const ds = gesture.el?.dataset;
  if (!ds || ds[key] === (value ?? undefined)) return;
  if (value === null) delete ds[key];
  else ds[key] = value;
};

/** The one place the zoom changes: clamped to the card's fit, and back to normal size at 1. */
export function setZoom(z: number) {
  gesture.zoom = Math.min(MAX_ZOOM, gesture.maxZoom, Math.max(MIN_ZOOM, z));
  if (gesture.zoom <= MIN_ZOOM) gesture.panPx = 0;
  mirror('zoom', gesture.zoom > MIN_ZOOM ? gesture.zoom.toFixed(2) : null);
}

/** Called every frame by the focused card with how far its text lets it zoom. */
export function setMaxZoom(max: number) {
  gesture.maxZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, max));
  mirror('maxZoom', gesture.maxZoom.toFixed(2));
  if (gesture.zoom > gesture.maxZoom) setZoom(gesture.zoom);
}

/** The enlarged card's vertical offset after clamping, mirrored for tests. */
export function setPan(px: number) {
  gesture.panPx = px;
  mirror('pan', gesture.zoom > MIN_ZOOM ? String(Math.round(px)) : null);
}
