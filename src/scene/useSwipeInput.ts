import { useEffect } from 'react';
import { gesture, MAX_ZOOM, MIN_ZOOM, useDurar } from '../state/store';
import type { SwipeDir } from '../types';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * One gesture model for every input: mouse drag, touch swipe, trackpad two-finger swipe and the
 * arrow keys. Right = “I know this”, left = “still learning”. Two fingers spread apart (or a
 * trackpad pinch) enlarge the focused card instead; it keeps that size until pinched back.
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
    const setZoom = (z: number) => {
      gesture.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
      if (gesture.zoom > MIN_ZOOM) el.dataset.zoom = gesture.zoom.toFixed(2);
      else delete el.dataset.zoom;
    };
    // A new card in focus starts at its normal size.
    const unsubscribe = useDurar.subscribe((s, prev) => {
      if (s.order[0] !== prev.order[0]) setZoom(1);
    });

    // ---- Pointer (mouse + touch + pen) ---------------------------------------------------------
    let startX = 0;
    let startY = 0;
    let pointerId: number | null = null;
    let samples: { x: number; t: number }[] = [];
    // Every finger currently down on the scene, for the pinch.
    const fingers = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; zoom: number } | null = null;
    const spread = () => {
      const [a, b] = [...fingers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Controls on or over the card (e.g. Save) are taps, not the start of a swipe.
      if (e.target instanceof Element && e.target.closest('button, a, input, [role="menu"]')) return;
      if (e.pointerType === 'touch') fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) {
        // A second finger turns the swipe into a pinch: the card goes back to centre and grows.
        pointerId = null;
        gesture.dragging = false;
        gesture.dragPx = 0;
        delete el.dataset.dragging;
        pinch = { dist: Math.max(1, spread()), zoom: gesture.zoom };
        gesture.pinching = true;
        return;
      }
      // Only a gesture that starts with one finger swipes (not the finger left after a pinch).
      if (pointerId !== null || fingers.size > 1 || pinch) return;
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
      if (fingers.has(e.pointerId)) {
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && fingers.size === 2) setZoom((pinch.zoom * spread()) / pinch.dist);
      }
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
    const lift = (e: PointerEvent) => {
      if (!fingers.delete(e.pointerId)) return;
      if (fingers.size < 2) gesture.pinching = false;
      if (fingers.size === 0) pinch = null;
    };
    const up = (e: PointerEvent) => {
      lift(e);
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
      lift(e);
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
      if (e.ctrlKey) {
        // Trackpad pinch (and Ctrl + scroll) zooms the card rather than the page.
        e.preventDefault();
        setZoom(gesture.zoom * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01)));
        return;
      }
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
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

    // ---- Safari's own pinch events (desktop trackpad; on iPhone the pointers above handle it) ----
    type WebKitGesture = Event & { scale: number };
    let gestureStart = 1;
    const gstart = (e: Event) => {
      e.preventDefault();
      gestureStart = gesture.zoom;
    };
    const gchange = (e: Event) => {
      e.preventDefault();
      if (fingers.size < 2) setZoom(gestureStart * (e as WebKitGesture).scale);
    };

    // ---- Keyboard ---------------------------------------------------------------------------
    const key = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey || document.body.dataset.modal) return;
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
    el.addEventListener('gesturestart', gstart);
    el.addEventListener('gesturechange', gchange);
    return () => {
      unsubscribe();
      el.removeEventListener('gesturestart', gstart);
      el.removeEventListener('gesturechange', gchange);
      gesture.pinching = false;
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
