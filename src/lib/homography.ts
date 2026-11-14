/** A point on screen, in CSS px. */
export type Pt = readonly [number, number];

type M3 = [number, number, number, number, number, number, number, number, number];

const mul = (a: M3, b: M3): M3 => {
  const r = new Array(9).fill(0) as M3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
};

/** The projective map of the unit square's corners (0,0) (1,0) (1,1) (0,1) onto `q` (Heckbert). */
function squareToQuad([p0, p1, p2, p3]: readonly [Pt, Pt, Pt, Pt]): M3 {
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const dx3 = x0 - x1 + x2 - x3;
  const dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0, 1];
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

/**
 * A CSS `matrix3d()` (for `transform-origin: 0 0`) that maps the rectangle `src` of an element
 * ({x, y, w, h} in its own CSS px) onto the screen quadrilateral `quad`, given clockwise from the
 * top-left. Used to lay the sharp copy of the focused card's text exactly over the 3D card.
 */
export function rectToQuad(src: { x: number; y: number; w: number; h: number }, quad: readonly [Pt, Pt, Pt, Pt]): string {
  const toUnit: M3 = [1 / src.w, 0, -src.x / src.w, 0, 1 / src.h, -src.y / src.h, 0, 0, 1];
  const m = mul(squareToQuad(quad), toUnit);
  const n = m.map((v) => v / m[8]);
  const f = (v: number) => (Math.abs(v) < 1e-12 ? '0' : v.toPrecision(8));
  // Row-major 3×3 [a b c; d e f; g h 1] → column-major 4×4 with z passed through.
  return `matrix3d(${[n[0], n[3], 0, n[6], n[1], n[4], 0, n[7], 0, 0, 1, 0, n[2], n[5], 0, n[8]].map(f).join(',')})`;
}

/** Applies the same map to one point (for tests). */
export function mapPoint(src: { x: number; y: number; w: number; h: number }, quad: readonly [Pt, Pt, Pt, Pt], [x, y]: Pt): Pt {
  const toUnit: M3 = [1 / src.w, 0, -src.x / src.w, 0, 1 / src.h, -src.y / src.h, 0, 0, 1];
  const m = mul(squareToQuad(quad), toUnit);
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}
