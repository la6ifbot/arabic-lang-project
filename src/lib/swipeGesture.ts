/**
 * The gesture rules (Phase 0.9, decisions 1–8), kept pure so they can be unit-tested:
 *
 * - Swipe right = next card, swipe left = previous card, like turning the pages of an Arabic book.
 *   Neither changes progress.
 * - Swipe up = “I know it”.
 * - On an enlarged card a vertical drag pans the card instead, so “I know it” can't fire by accident.
 * - A touch that starts at the bottom edge of the screen is the phone's own home gesture: ignored.
 */

export type SwipeAction = 'next' | 'previous' | 'know';

/** What a drag is, decided by its first few pixels. `none`: a downward drag, which does nothing. */
export type DragMode = 'undecided' | 'horizontal' | 'up' | 'pan' | 'none';

/** How far a pointer moves before the drag's direction is decided. */
export const AXIS_LOCK_PX = 10;
/** Touches starting this close to the bottom edge belong to the phone (the iPhone home bar). */
export const BOTTOM_EDGE_PX = 28;
/** A quick flick commits a shorter drag: speed in px/ms, and the least distance it needs. */
export const FLICK_SPEED = 0.55;
export const FLICK_MIN_PX = 40;

/** Horizontal distance that commits a page turn. */
export const turnThreshold = (width: number) => Math.min(170, width * 0.2);
/** Upward distance that commits “I know it”. A little shorter than a turn: thumbs travel less upward. */
export const upThreshold = (height: number) => Math.min(150, height * 0.16);

/** True when a touch at this height belongs to the phone's own bottom-edge gesture. */
export function startsAtBottomEdge(y: number, viewportHeight: number, pointerType: string): boolean {
  return pointerType !== 'mouse' && y >= viewportHeight - BOTTOM_EDGE_PX;
}

/** Decides what a drag is once it has moved far enough; `undecided` until then. */
export function classifyDrag(dx: number, dy: number, zoomed: boolean): DragMode {
  if (Math.hypot(dx, dy) <= AXIS_LOCK_PX) return 'undecided';
  if (Math.abs(dy) > Math.abs(dx)) {
    if (zoomed) return 'pan';
    return dy < 0 ? 'up' : 'none';
  }
  return 'horizontal';
}

export interface Release {
  mode: DragMode;
  dx: number;
  dy: number;
  /** Speed at release, px/ms (positive = right / down). */
  vx: number;
  vy: number;
  width: number;
  height: number;
}

/** What a released drag does, if anything. */
export function releaseAction({ mode, dx, dy, vx, vy, width, height }: Release): SwipeAction | null {
  if (mode === 'horizontal') {
    const far = Math.abs(dx) > turnThreshold(width);
    const flick = Math.abs(vx) > FLICK_SPEED && Math.abs(dx) > FLICK_MIN_PX && Math.sign(vx) === Math.sign(dx);
    if (far || flick) return dx > 0 ? 'next' : 'previous';
  }
  if (mode === 'up') {
    const far = -dy > upThreshold(height);
    const flick = -vy > FLICK_SPEED && -dy > FLICK_MIN_PX;
    if (far || flick) return 'know';
  }
  return null;
}

/** The label shown while dragging (“Next”, “Previous”, “↑ I know it”) and how strongly, 0–1. */
export function dragPreview(mode: DragMode, dx: number, dy: number, width: number, height: number): { action: SwipeAction; strength: number } | null {
  if (mode === 'horizontal' && dx !== 0) {
    return { action: dx > 0 ? 'next' : 'previous', strength: Math.min(1, Math.abs(dx) / turnThreshold(width)) };
  }
  if (mode === 'up' && dy < 0) return { action: 'know', strength: Math.min(1, -dy / upThreshold(height)) };
  return null;
}

/** The arrow keys: ← next and → previous (the right-to-left page turn), ↑ “I know it”. */
export function keyAction(key: string): SwipeAction | null {
  if (key === 'ArrowLeft') return 'next';
  if (key === 'ArrowRight') return 'previous';
  if (key === 'ArrowUp') return 'know';
  return null;
}

/**
 * A trackpad's two-finger swipe, accumulated in the swipe's own direction (positive = the content
 * moves right, as a finger drag would). Past the turn threshold it turns the page.
 */
export function wheelAction(acc: number, width: number): SwipeAction | null {
  if (Math.abs(acc) <= turnThreshold(width)) return null;
  return acc > 0 ? 'next' : 'previous';
}

export const ACTION_LABEL: Record<SwipeAction, string> = { next: 'Next', previous: 'Previous', know: '↑ I know it' };
