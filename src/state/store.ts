import { create } from 'zustand';
import { onNavigate, slugFromPath, topicFromPath } from '../lib/router';
import { prefersReducedMotion } from '../lib/device';
import { topicSlugs } from '../lib/topics';
import { TODAY, WORD_BY_SLUG } from '../lib/words';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_FIT } from '../lib/zoom';
import type { SwipeDir } from '../types';

/** A “still learning” card resurfaces after this many swipes… */
export const LEARNING_REINSERT_AT = 4;
/** …and, once reviewed, one more time after this many (spaced out). */
export const REVIEW_REINSERT_AT = 8;
/** Comebacks still owed after the first one, when a card is marked “still learning”. */
const REVIEWS_AFTER_FIRST = 1;
/** How long a departing (“known”) card keeps rendering while it sinks. */
export const EXIT_MS = 3200;

export interface Departure {
  slug: string;
  at: number;
}

/** Cards the 3D scene is drawing in the rotation right now (written by CardField). */
export const sceneCards = { visible: [] as string[] };

/** A swipe as the progress engine sees it; `returning` = an in-session comeback of a “still learning” word. */
export interface SwipeEvent {
  slug: string;
  dir: SwipeDir;
  returning: boolean;
  /** Date.now() at the swipe. */
  at: number;
}

/**
 * Set by the progress engine once it loads (a lazy chunk). Swipes before that are kept in `early`
 * and replayed, so none is lost while the engine is still on its way.
 */
export const swipeHook: { after: ((e: SwipeEvent) => void) | null; early: SwipeEvent[] } = { after: null, early: [] };

export interface Motion {
  slug: string;
  at: number;
}

interface DurarState {
  /** Rotation queue; order[0] is the focused card. */
  order: string[];
  departures: Departure[];
  /** Last card sent back as “still learning” (drives its drift-aside motion). */
  learning: Motion | null;
  /** Card currently rising from the depths after a search. */
  surfacing: Motion | null;
  /** Session-only counts; persistence arrives with accounts (Phase 0.2/0.5). */
  swipes: number;
  /** Still-learning words and how many more comebacks each is owed this session. */
  reviews: Record<string, number>;
  textMode: boolean;
  /** The chosen topic's id, or null for the whole sea. The rotation only holds its words. */
  topic: string | null;
  /** When the topic last changed (performance.now()), for the switch choreography. */
  switchedAt: number;
  swipe: (dir: SwipeDir) => void;
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
  learning: null,
  surfacing: null,
  swipes: 0,
  reviews: {},
  textMode: false,

  swipe: (dir) => {
    const { order, departures, swipes, reviews } = get();
    if (order.length < 2) return;
    const now = performance.now();
    const [current, ...rest] = order;
    const owed = reviews[current] ?? 0;
    const event: SwipeEvent = { slug: current, dir, returning: current in reviews, at: Date.now() };
    const fresh = departures.filter((d) => now - d.at < EXIT_MS && d.slug !== current);
    if (dir === 'known' && owed > 0) {
      // Known on review: it still comes back once more, later (spaced repetition, in miniature).
      const next = [...rest];
      next.splice(Math.min(REVIEW_REINSERT_AT - 1, next.length), 0, current);
      set({
        order: next,
        departures: [...fresh, { slug: current, at: now }],
        reviews: { ...reviews, [current]: owed - 1 },
        swipes: swipes + 1,
        surfacing: null,
      });
    } else if (dir === 'known') {
      const { [current]: _done, ...rest2 } = reviews;
      void _done;
      set({
        order: [...rest, current],
        departures: [...fresh, { slug: current, at: now }],
        reviews: rest2,
        swipes: swipes + 1,
        surfacing: null,
      });
    } else {
      // Still learning: linger in view a moment, come back soon, then once more later.
      const next = [...rest];
      next.splice(Math.min(LEARNING_REINSERT_AT - 1, next.length), 0, current);
      set({
        order: next,
        learning: { slug: current, at: now },
        reviews: { ...reviews, [current]: REVIEWS_AFTER_FIRST },
        departures: fresh,
        swipes: swipes + 1,
        surfacing: null,
      });
    }
    if (swipeHook.after) swipeHook.after(event);
    else swipeHook.early.push(event);
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
      reviews: {},
      learning: null,
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
  /** Horizontal drag offset of the focused card, in CSS pixels. */
  dragPx: 0,
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
