import { useEffect } from 'react';
import {
  classifyDrag,
  keyAction,
  releaseAction,
  startsAtBottomEdge,
  turnThreshold,
  upThreshold,
  wheelAction,
  type DragMode,
  type SwipeAction,
} from '../lib/swipeGesture';
import { gesture, MIN_ZOOM, setZoom, useDurar } from '../state/store';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** Runs a swipe's action on the store. */
export function act(action: SwipeAction) {
  const s = useDurar.getState();
  if (action === 'next') s.next();
  else if (action === 'previous') s.previous();
  else s.know();
}

/**
 * One gesture model for every input (Phase 0.9, src/lib/swipeGesture.ts): mouse drag, touch swipe,
 * trackpad two-finger swipe and the arrow keys. Right = next card, left = previous, up = “I know it”.
 * Two fingers spread apart (or a trackpad pinch) enlarge the focused card instead; it keeps that size
 * until pinched back, and while it's enlarged an up/down drag (or scroll) moves it to show its top
 * and bottom, so “I know it” can't fire by accident.
 */
export function useSwipeInput(target: React.RefObject<HTMLElement | null>, onFirstUse?: () => void) {
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const run = (action: SwipeAction) => {
      act(action);
      onFirstUse?.();
    };
    gesture.el = el;
    // A new card in focus starts at its normal size.
    const unsubscribe = useDurar.subscribe((s, prev) => {
      if (s.order[0] !== prev.order[0]) setZoom(1);
    });

    const resetDrag = () => {
      gesture.dragging = false;
      gesture.dragPx = 0;
      gesture.dragPy = 0;
      gesture.mode = 'undecided';
      delete el.dataset.dragging;
    };

    // ---- Pointer (mouse + touch + pen) ---------------------------------------------------------
    let startX = 0;
    let startY = 0;
    let pointerId: number | null = null;
    let samples: { x: number; y: number; t: number }[] = [];
    let mode: DragMode = 'undecided';
    let panStart = 0;
    // Every finger currently down on the scene, for the pinch.
    const fingers = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; zoom: number } | null = null;
    const spread = () => {
      const [a, b] = [...fingers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    /** Rubber-band slightly past the commit point, for weight. */
    const band = (d: number, lim: number) => (Math.abs(d) > lim ? Math.sign(d) * (lim + (Math.abs(d) - lim) * 0.35) : d);

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Controls on or over the card (e.g. Save) are taps, not the start of a swipe.
      if (e.target instanceof Element && e.target.closest('button, a, input, [role="menu"]')) return;
      if (e.pointerType === 'touch') fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) {
        // A second finger turns the swipe into a pinch: the card goes back to centre and grows.
        pointerId = null;
        resetDrag();
        pinch = { dist: Math.max(1, spread()), zoom: gesture.zoom };
        gesture.pinching = true;
        return;
      }
      // Only a gesture that starts with one finger swipes (not the finger left after a pinch), and
      // never one that starts on the phone's own bottom edge (the iPhone home gesture).
      if (pointerId !== null || fingers.size > 1 || pinch) return;
      if (startsAtBottomEdge(e.clientY, window.innerHeight, e.pointerType)) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
      mode = 'undecided';
      panStart = gesture.panPx;
      gesture.dragging = true;
      gesture.dragPx = 0;
      gesture.dragPy = 0;
      gesture.mode = 'undecided';
    };
    const move = (e: PointerEvent) => {
      gesture.px = (e.clientX / window.innerWidth) * 2 - 1;
      gesture.py = -((e.clientY / window.innerHeight) * 2 - 1);
      if (fingers.has(e.pointerId)) {
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && fingers.size === 2) {
          const d = Math.max(1, spread());
          const want = (pinch.zoom * d) / pinch.dist;
          setZoom(want);
          // Held at the limit: restart the pinch from here, so bringing the fingers back responds at once.
          if (gesture.zoom !== want) pinch = { dist: d, zoom: gesture.zoom };
        }
      }
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (mode === 'undecided') {
        mode = classifyDrag(dx, dy, gesture.zoom > MIN_ZOOM);
        gesture.mode = mode;
      }
      samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (samples.length > 6) samples.shift();
      if (mode === 'pan') {
        gesture.panPx = panStart + dy;
        el.dataset.dragging = 'true';
      } else if (mode === 'horizontal') {
        gesture.dragPx = band(dx, turnThreshold(el.clientWidth) * 1.6);
        el.dataset.dragging = 'true';
      } else if (mode === 'up') {
        gesture.dragPy = band(Math.min(0, dy), upThreshold(window.innerHeight) * 1.6);
        el.dataset.dragging = 'true';
      }
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
      const first = samples[0];
      const dt = first && e.timeStamp > first.t ? e.timeStamp - first.t : 0;
      const action = releaseAction({
        mode,
        dx: e.clientX - startX,
        dy: e.clientY - startY,
        vx: dt ? (e.clientX - first.x) / dt : 0,
        vy: dt ? (e.clientY - first.y) / dt : 0,
        width: el.clientWidth,
        height: window.innerHeight,
      });
      resetDrag();
      if (action) run(action);
    };
    const cancel = (e: PointerEvent) => {
      lift(e);
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      resetDrag();
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
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) {
        if (gesture.zoom > MIN_ZOOM) {
          e.preventDefault();
          gesture.panPx -= e.deltaY * (e.deltaMode === 1 ? 16 : 1);
        }
        return;
      }
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
      gesture.mode = 'horizontal';
      const action = wheelAction(acc, el.clientWidth);
      if (action) {
        acc = 0;
        gesture.dragPx = 0;
        gesture.mode = 'undecided';
        lockedUntil = now + 450;
        run(action);
        return;
      }
      idle = window.setTimeout(() => {
        acc = 0;
        gesture.dragPx = 0;
        gesture.mode = 'undecided';
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
      if (fingers.size >= 2) return;
      const scale = (e as WebKitGesture).scale;
      const want = gestureStart * scale;
      setZoom(want);
      // Held at the limit: re-base, so reversing the pinch responds at once.
      if (gesture.zoom !== want && scale > 0) gestureStart = gesture.zoom / scale;
    };

    // ---- Keyboard: ← next, → previous (the right-to-left page turn), ↑ “I know it” ----------------
    const key = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey || document.body.dataset.modal) return;
      const action = keyAction(e.key);
      if (!action) return;
      e.preventDefault();
      run(action);
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
      if (gesture.el === el) gesture.el = null;
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
