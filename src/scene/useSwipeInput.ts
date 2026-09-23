import { useEffect } from 'react';
import { gesture, useDurar } from '../state/store';
import type { SwipeDir } from '../types';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * One gesture model for every input: mouse drag, touch swipe, trackpad two-finger swipe and the
 * arrow keys. Right = “I know this”, left = “still learning”.
 */
export function useSwipeInput(target: React.RefObject<HTMLElement | null>, onFirstUse?: () => void) {
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const swipe = (dir: SwipeDir) => {
      useDurar.getState().swipe(dir);
      onFirstUse?.();
    };
    const threshold = () => Math.min(170, el.clientWidth * 0.2);

    // ---- Pointer (mouse + touch + pen) ---------------------------------------------------------
    let startX = 0;
    let startY = 0;
    let pointerId: number | null = null;
    let samples: { x: number; t: number }[] = [];

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || pointerId !== null) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      samples = [{ x: e.clientX, t: e.timeStamp }];
      gesture.dragging = true;
      gesture.dragPx = 0;
    };
    const move = (e: PointerEvent) => {
      gesture.px = (e.clientX / window.innerWidth) * 2 - 1;
      gesture.py = -((e.clientY / window.innerHeight) * 2 - 1);
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // Rubber-band slightly past the commit point for weight.
      const lim = threshold() * 1.6;
      gesture.dragPx = Math.abs(dx) > lim ? Math.sign(dx) * (lim + (Math.abs(dx) - lim) * 0.35) : dx;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) el.dataset.dragging = 'true';
      samples.push({ x: e.clientX, t: e.timeStamp });
      if (samples.length > 6) samples.shift();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      gesture.dragging = false;
      delete el.dataset.dragging;
      const dx = e.clientX - startX;
      const first = samples[0];
      const v = first && e.timeStamp > first.t ? (e.clientX - first.x) / (e.timeStamp - first.t) : 0; // px/ms
      gesture.dragPx = 0;
      if (Math.abs(dx) > threshold() || (Math.abs(v) > 0.55 && Math.abs(dx) > 40)) swipe(dx > 0 ? 'known' : 'learning');
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      gesture.dragging = false;
      gesture.dragPx = 0;
      delete el.dataset.dragging;
    };

    // ---- Trackpad (horizontal wheel) -----------------------------------------------------------
    let acc = 0;
    let idle = 0;
    let lockedUntil = 0;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || e.ctrlKey) return;
      e.preventDefault();
      const now = performance.now();
      window.clearTimeout(idle);
      if (now < lockedUntil) {
        // Swallow the momentum tail of a gesture that already committed.
        lockedUntil = now + 220;
        return;
      }
      acc -= e.deltaX * (e.deltaMode === 1 ? 16 : 1);
      gesture.dragPx = acc;
      if (Math.abs(acc) > threshold()) {
        const dir: SwipeDir = acc > 0 ? 'known' : 'learning';
        acc = 0;
        gesture.dragPx = 0;
        lockedUntil = now + 450;
        swipe(dir);
        return;
      }
      idle = window.setTimeout(() => {
        acc = 0;
        gesture.dragPx = 0;
      }, 180);
    };

    // ---- Keyboard ---------------------------------------------------------------------------
    const key = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        swipe('known');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        swipe('learning');
      }
    };

    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
      window.clearTimeout(idle);
    };
  }, [target, onFirstUse]);
}
