import { expect, test } from 'vitest';
import { mapPoint, rectToQuad, type Pt } from '../../src/lib/homography';

const src = { x: 20, y: 0, w: 160, h: 300 };

test('maps a rectangle onto a perspective quad, corner to corner', () => {
  const quad: [Pt, Pt, Pt, Pt] = [
    [100, 50],
    [290, 60],
    [280, 420],
    [110, 400],
  ];
  const corners: Pt[] = [
    [20, 0],
    [180, 0],
    [180, 300],
    [20, 300],
  ];
  corners.forEach((c, i) => {
    const [x, y] = mapPoint(src, quad, c);
    expect(x).toBeCloseTo(quad[i][0], 6);
    expect(y).toBeCloseTo(quad[i][1], 6);
  });
});

test('a plain rectangle is a scale and a shift', () => {
  const quad: [Pt, Pt, Pt, Pt] = [
    [10, 10],
    [90, 10],
    [90, 160],
    [10, 160],
  ];
  expect(rectToQuad(src, quad)).toBe('matrix3d(0.50000000,0,0,0,0,0.50000000,0,0,0,0,1.0000000,0,0,10.000000,0,1.0000000)');
});
