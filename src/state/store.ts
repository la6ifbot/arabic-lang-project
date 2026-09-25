import { create } from 'zustand';
import { onNavigate, slugFromPath } from '../lib/router';
import { TODAY, WORDS, WORD_BY_SLUG } from '../lib/words';
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
  swipe: (dir: SwipeDir) => void;
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

export function initialOrder(startSlug: string | null): string[] {
  // Deep links open on their word; everything else opens on today's Pearl of the Day.
  const first = startSlug && WORD_BY_SLUG.has(startSlug) ? startSlug : TODAY.slug;
  const rest = dailyShuffle(WORDS.map((w) => w.slug).filter((s) => s !== first));
  return [first, ...rest];
}

export const useDurar = create<DurarState>((set, get) => ({
  order: initialOrder(null),
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

  setTextMode: (textMode) => set({ textMode }),
}));

// Arriving at /word/<slug> from inside the app (Library, back button): that pearl rises into focus.
onNavigate((route, path) => {
  if (route.name !== 'scene') return;
  const slug = slugFromPath(path);
  if (slug) useDurar.getState().surface(slug);
});

/** High-frequency input state, kept out of React to avoid re-rendering at pointer rate. */
export const gesture = {
  /** Horizontal drag offset of the focused card, in CSS pixels. */
  dragPx: 0,
  dragging: false,
  /** Pointer position in normalized device coords, for subtle camera parallax. */
  px: 0,
  py: 0,
};
