import { describe, expect, it } from 'vitest';
import {
  AXIS_LOCK_PX,
  BOTTOM_EDGE_PX,
  classifyDrag,
  dragPreview,
  keyAction,
  releaseAction,
  startsAtBottomEdge,
  turnThreshold,
  upThreshold,
  wheelAction,
} from '../../src/lib/swipeGesture';

const W = 390;
const H = 844;
const release = (over: Partial<Parameters<typeof releaseAction>[0]>) =>
  releaseAction({ mode: 'horizontal', dx: 0, dy: 0, vx: 0, vy: 0, width: W, height: H, ...over });

describe('classifyDrag', () => {
  it('waits until the drag has moved a little', () => {
    expect(classifyDrag(3, 4, false)).toBe('undecided');
    expect(classifyDrag(AXIS_LOCK_PX, 0, false)).toBe('undecided');
  });
  it('horizontal drags turn pages', () => {
    expect(classifyDrag(30, 8, false)).toBe('horizontal');
    expect(classifyDrag(-30, -8, false)).toBe('horizontal');
  });
  it('upward drags are “I know it”; downward drags do nothing', () => {
    expect(classifyDrag(4, -30, false)).toBe('up');
    expect(classifyDrag(4, 30, false)).toBe('none');
  });
  it('on an enlarged card, vertical drags pan instead (never “I know it”)', () => {
    expect(classifyDrag(4, -30, true)).toBe('pan');
    expect(classifyDrag(4, 30, true)).toBe('pan');
    expect(classifyDrag(30, 4, true)).toBe('horizontal');
  });
});

describe('releaseAction', () => {
  it('right = next, left = previous, past the threshold', () => {
    const far = turnThreshold(W) + 1;
    expect(release({ dx: far })).toBe('next');
    expect(release({ dx: -far })).toBe('previous');
    expect(release({ dx: far - 2 })).toBeNull();
  });
  it('a quick flick turns with less distance, but only in its own direction', () => {
    expect(release({ dx: 50, vx: 0.9 })).toBe('next');
    expect(release({ dx: -50, vx: -0.9 })).toBe('previous');
    expect(release({ dx: 50, vx: -0.9 })).toBeNull();
    expect(release({ dx: 20, vx: 0.9 })).toBeNull();
  });
  it('up past its threshold, or a quick upward flick, is “I know it”', () => {
    expect(release({ mode: 'up', dy: -(upThreshold(H) + 1) })).toBe('know');
    expect(release({ mode: 'up', dy: -50, vy: -0.9 })).toBe('know');
    expect(release({ mode: 'up', dy: -30 })).toBeNull();
  });
  it('pans, downward drags and undecided taps never act', () => {
    expect(release({ mode: 'pan', dy: -400 })).toBeNull();
    expect(release({ mode: 'none', dy: 400 })).toBeNull();
    expect(release({ mode: 'undecided', dx: 400 })).toBeNull();
  });
  it('a horizontal drag never becomes “I know it”, however far up it wanders', () => {
    expect(release({ mode: 'horizontal', dx: 30, dy: -400, vy: -2 })).toBeNull();
  });
});

describe('startsAtBottomEdge (the iPhone home gesture)', () => {
  it('ignores touches on the bottom edge', () => {
    expect(startsAtBottomEdge(H - 5, H, 'touch')).toBe(true);
    expect(startsAtBottomEdge(H - BOTTOM_EDGE_PX, H, 'pen')).toBe(true);
    expect(startsAtBottomEdge(H - BOTTOM_EDGE_PX - 1, H, 'touch')).toBe(false);
  });
  it('a mouse can start anywhere', () => {
    expect(startsAtBottomEdge(H - 2, H, 'mouse')).toBe(false);
  });
});

describe('dragPreview', () => {
  it('names the action and grows to full strength at the threshold', () => {
    expect(dragPreview('horizontal', 10, 0, W, H)).toEqual({ action: 'next', strength: 10 / turnThreshold(W) });
    expect(dragPreview('horizontal', -500, 0, W, H)).toEqual({ action: 'previous', strength: 1 });
    expect(dragPreview('up', 0, -upThreshold(H), W, H)).toEqual({ action: 'know', strength: 1 });
  });
  it('shows nothing for pans, taps or downward drags', () => {
    expect(dragPreview('pan', 0, -200, W, H)).toBeNull();
    expect(dragPreview('undecided', 5, 5, W, H)).toBeNull();
    expect(dragPreview('none', 0, 200, W, H)).toBeNull();
  });
});

describe('keys and trackpad', () => {
  it('← next, → previous (right-to-left), ↑ “I know it”', () => {
    expect(keyAction('ArrowLeft')).toBe('next');
    expect(keyAction('ArrowRight')).toBe('previous');
    expect(keyAction('ArrowUp')).toBe('know');
    expect(keyAction('ArrowDown')).toBeNull();
  });
  it('a two-finger swipe turns the page in its own direction', () => {
    expect(wheelAction(turnThreshold(1280) + 1, 1280)).toBe('next');
    expect(wheelAction(-turnThreshold(1280) - 1, 1280)).toBe('previous');
    expect(wheelAction(20, 1280)).toBeNull();
  });
});
