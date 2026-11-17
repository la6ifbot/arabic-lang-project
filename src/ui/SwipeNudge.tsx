import { useEffect } from 'react';
import { prefersReducedMotion } from '../lib/device';
import { gesture } from '../state/store';
import { nudge } from './DragLabel';

export const NUDGE_KEY = 'durar.nudge.v1';
/** How long the nudge takes, there and back (ms). */
export const NUDGE_MS = 1600;
/** How far the card leans to the right (CSS px). */
const NUDGE_PX = 44;

function seen(): boolean {
  try {
    return localStorage.getItem(NUDGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(NUDGE_KEY, '1');
  } catch {
    /* private mode: it may show once more next visit */
  }
}

/** Still to come on this device: the word-tap hint waits for it (one hint at a time, decision 23). */
export function nudgePending(): boolean {
  return !seen();
}

/** Free to show: nothing over the sea (the walk-through, a dialog, the help box) and no hand on the card. */
const clear = () => !document.body.dataset.modal && !document.querySelector('.help-box:not([hidden])') && !gesture.dragging;

/**
 * Once, on someone's first card (Phase 0.9, decision 7): the card leans gently to the right and back,
 * with a faint “Next”, to show which way the pages turn. It waits for the first-time walk-through to
 * finish, and never comes again once it has shown or the person has already swiped. Reduced motion:
 * the card stays still and only the label fades in and out.
 */
export function SwipeNudge({ used }: { used: boolean }) {
  useEffect(() => {
    if (used) {
      if (!seen()) markSeen();
      return;
    }
    if (seen()) return;
    let raf = 0;
    let wait = 0;
    let start = 0;
    const still = prefersReducedMotion();
    const frame = (t: number) => {
      start ||= t;
      const k = Math.min(1, (t - start) / NUDGE_MS);
      const lean = Math.sin(Math.PI * k); // out and back
      nudge.strength = lean * 0.7;
      if (!still && !gesture.dragging) gesture.dragPx = lean * NUDGE_PX;
      if (k < 1) raf = requestAnimationFrame(frame);
      else {
        nudge.strength = 0;
        if (!gesture.dragging) gesture.dragPx = 0;
        document.body.dataset.nudged = 'true';
      }
    };
    // A calm moment first: the card settled, nothing over it.
    let calm = 0;
    wait = window.setInterval(() => {
      calm = clear() ? calm + 1 : 0;
      if (calm < 3) return;
      window.clearInterval(wait);
      markSeen();
      raf = requestAnimationFrame(frame);
    }, 400);
    return () => {
      window.clearInterval(wait);
      cancelAnimationFrame(raf);
      if (nudge.strength) {
        nudge.strength = 0;
        if (!gesture.dragging) gesture.dragPx = 0;
      }
    };
  }, [used]);
  return null;
}
