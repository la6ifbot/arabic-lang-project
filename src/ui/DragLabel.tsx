import { useRef } from 'react';
import { ACTION_LABEL, dragPreview, type SwipeAction } from '../lib/swipeGesture';
import { gesture } from '../state/store';
import { useAnimationFrame } from './useAnimationFrame';

/** The first-card nudge (src/ui/SwipeNudge.tsx) shows the label too, at this strength (0–1). */
export const nudge = { strength: 0 };

/**
 * What a drag will do, written on screen while it happens (Phase 0.9, decision 7): “Next”,
 * “Previous” or “↑ I know it”, fading in with the drag's distance and full at the point where
 * letting go commits. Decorative: the buttons and the live region say the same to screen readers.
 */
export function DragLabel() {
  const el = useRef<HTMLParagraphElement>(null);
  const shown = useRef<{ action: SwipeAction | null; opacity: string }>({ action: null, opacity: '0' });

  useAnimationFrame(() => {
    const p = el.current;
    if (!p) return;
    const preview =
      dragPreview(gesture.mode, gesture.dragPx, gesture.dragPy, gesture.el?.clientWidth ?? window.innerWidth, window.innerHeight) ??
      (nudge.strength > 0 ? { action: 'next' as const, strength: nudge.strength } : null);
    const action = preview?.action ?? shown.current.action;
    // Faint at first, clear once the drag has gone far enough to commit.
    const opacity = preview ? (0.15 + 0.85 * preview.strength).toFixed(2) : '0';
    if (action !== shown.current.action && action) {
      p.textContent = ACTION_LABEL[action];
      p.dataset.action = action;
    }
    if (opacity !== shown.current.opacity) {
      p.style.opacity = opacity;
      if (preview && preview.strength >= 1) p.dataset.ready = 'true';
      else delete p.dataset.ready;
    }
    shown.current = { action, opacity };
  });

  return <p ref={el} className="drag-label" aria-hidden="true" data-testid="drag-label" />;
}
