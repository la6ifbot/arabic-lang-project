import { create } from 'zustand';
import { onNavigate, slugFromPath } from '../lib/router';
import { WORDS, WORD_BY_SLUG } from '../lib/words';
import type { SwipeDir } from '../types';

/** A “still learning” card resurfaces after this many swipes. */
export const LEARNING_REINSERT_AT = 4;
/** How long a departing (“known”) card keeps rendering while it sinks. */
export const EXIT_MS = 3200;

export interface Departure {
  slug: string;
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
  /** Last card sent back as “still learning” (drives its drift-aside motion). */
  learning: Motion | null;
  /** Card currently rising from the depths after a search. */
  surfacing: Motion | null;
  /** Session-only counts; persistence arrives with accounts (Phase 0.2/0.5). */
  swipes: number;
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
  const first = startSlug && WORD_BY_SLUG.has(startSlug) ? startSlug : 'durrah';
  const rest = dailyShuffle(WORDS.map((w) => w.slug).filter((s) => s !== first));
  return [first, ...rest];
}

export const useDurar = create<DurarState>((set, get) => ({
  order: initialOrder(null),
  departures: [],
  learning: null,
  surfacing: null,
  swipes: 0,
  textMode: false,

  swipe: (dir) => {
    const { order, departures, swipes } = get();
    if (order.length < 2) return;
    const now = performance.now();
    const [current, ...rest] = order;
    if (dir === 'known') {
      set({
        order: [...rest, current],
        departures: [...departures.filter((d) => now - d.at < EXIT_MS && d.slug !== current), { slug: current, at: now }],
        swipes: swipes + 1,
        surfacing: null,
      });
    } else {
      const next = [...rest];
      next.splice(Math.min(LEARNING_REINSERT_AT - 1, next.length), 0, current);
      set({
        order: next,
        learning: { slug: current, at: now },
        departures: departures.filter((d) => now - d.at < EXIT_MS),
        swipes: swipes + 1,
        surfacing: null,
      });
    }
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
