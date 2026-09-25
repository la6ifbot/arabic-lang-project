import { create } from 'zustand';
import type { Progress } from '../../shared/mastery';

/**
 * Mastery progress as the UI sees it. Deliberately tiny: the rules, the queue and saving live in a
 * lazy chunk (src/progress/engine.ts) that loads after the scene, so first paint never waits.
 */
interface ProgressState {
  /** slug → progress. May include retired slugs; the UI skips those. */
  map: Record<string, Progress>;
  loaded: boolean;
  /** Nothing new and nothing due: “You've met every pearl for now.” */
  metAll: boolean;
  /** Last swipe's result, e.g. “Marked known · returns in 3 days”; `id` changes so repeats are re-announced. */
  note: { text: string; id: number };
  /** How much deeper the whole sea is (0 … the cap), set once per visit. */
  deep: number;
}

export const useProgress = create<ProgressState>(() => ({ map: {}, loaded: false, metAll: false, note: { text: '', id: 0 }, deep: 0 }));

/** “Still learning” (box 1) or “In the deep · 3 of 5”; nothing for words not yet swiped. */
export function progressLabel(p: Pick<Progress, 'box'> | undefined): string | null {
  if (!p) return null;
  return p.box === 1 ? 'Still learning' : `In the deep · ${p.box} of 5`;
}

let starting: Promise<unknown> | null = null;

/** Loads the progress engine (its own chunk). Safe to call many times. */
export function startProgress() {
  starting ??= import('../progress/engine').then((m) => m.start());
  return starting;
}

/** Account menu / Library: clears progress everywhere (loads the engine if needed). */
export async function resetProgress() {
  await startProgress();
  const m = await import('../progress/engine');
  await m.reset();
}
