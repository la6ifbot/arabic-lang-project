import * as THREE from 'three';

export type V3 = [number, number, number];
export type P2 = [number, number];
type Four = [number, number, number, number];

/** A turn about y plus a shift: the local frame of a tower, a gate or a building. */
export class Frame {
  readonly c: number;
  readonly s: number;
  constructor(
    readonly x = 0,
    readonly z = 0,
    readonly rot = 0,
  ) {
    this.c = Math.cos(rot);
    this.s = Math.sin(rot);
  }
  /** Local point → world. Same convention as `Object3D.rotation.y`. */
  p(x: number, y: number, z: number): V3 {
    return [this.x + x * this.c + z * this.s, y, this.z - x * this.s + z * this.c];
  }
  /** Local direction → world. */
  d(x: number, y: number, z: number): V3 {
    return [x * this.c + z * this.s, y, -x * this.s + z * this.c];
  }
  /** A frame shifted and turned relative to this one. */
  child(x: number, z: number, rot = 0): Frame {
    const [wx, , wz] = this.p(x, 0, z);
    return new Frame(wx, wz, this.rot + rot);
  }
  matrix(): THREE.Matrix4 {
    return new THREE.Matrix4().makeRotationY(this.rot).setPosition(this.x, 0, this.z);
  }
}

/** Shifts each object's texture origin, so neighbouring towers don't repeat the same stones. */
function jitter(a: number, b: number): number {
  const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return (h - Math.floor(h)) * 16;
}

/** Planar UVs in metres, picked by the dominant axis of the normal. */
function boxUV(p: THREE.Vector3, n: THREE.Vector3): P2 {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  if (ay >= ax && ay >= az) return [p.x, p.z];
  if (ax >= az) return [n.x > 0 ? -p.z : p.z, p.y];
  return [n.z > 0 ? p.x : -p.x, p.y];
}

export interface BoxOpts {
  /** Darkens the lower edge (weathering and splash). 0 = none. */
  grime?: number;
  top?: boolean;
  bottom?: boolean;
  /** Side faces to leave out (local ±x, ±z) where they are hidden anyway. */
  skip?: ('px' | 'nx' | 'pz' | 'nz')[];
}

/**
 * Collects triangles with UVs in metres (so one stone texture has the same scale everywhere),
 * vertex colours, and a per-vertex floodlight group used by the night lighting.
 */
export class Builder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private fl: number[] = [];
  /** Colour of what is added next. */
  tint = new THREE.Color(1, 1, 1);
  /** Floodlight group of what is added next: 0 unlit, 1 outer walls (lit from outside), 2 lit all round. */
  flood = 1;

  vert(p: V3, n: V3, u: number, v: number, shade = 1) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(u, v);
    this.col.push(this.tint.r * shade, this.tint.g * shade, this.tint.b * shade);
    this.fl.push(this.flood);
  }

  /** A planar quad. The winding is fixed up so the face points along `n`. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, uv: [P2, P2, P2, P2], shade: Four = [1, 1, 1, 1]) {
    const p = [a, b, c, d];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (Math.abs(g[0]) + Math.abs(g[1]) + Math.abs(g[2]) < 1e-9) {
      const e3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      g = [e2[1] * e3[2] - e2[2] * e3[1], e2[2] * e3[0] - e2[0] * e3[2], e2[0] * e3[1] - e2[1] * e3[0]];
    }
    const flip = g[0] * n[0] + g[1] * n[1] + g[2] * n[2] < 0;
    for (const i of flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) this.vert(p[i], n, uv[i][0], uv[i][1], shade[i]);
  }

  /**
   * Box in frame `f`, spanning local x0..x1, y0..y1, z0..z1. Side faces run u along the face and v
   * up, so stone courses line up at the same heights across the whole citadel.
   */
  box(f: Frame, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, o: BoxOpts = {}) {
    const g = 1 - (o.grime ?? 0.16);
    const sh: Four = [g, g, 1, 1];
    const j = jitter(f.x + x0 * 0.37, f.z + z1 * 0.53);
    const skip = o.skip ?? [];
    const P = (x: number, y: number, z: number) => f.p(x, y, z);
    if (!skip.includes('pz'))
      this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), f.d(0, 0, 1), [[x0 + j, y0], [x1 + j, y0], [x1 + j, y1], [x0 + j, y1]], sh);
    if (!skip.includes('nz'))
      this.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), f.d(0, 0, -1), [[-x1 + j, y0], [-x0 + j, y0], [-x0 + j, y1], [-x1 + j, y1]], sh);
    if (!skip.includes('px'))
      this.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), f.d(1, 0, 0), [[-z1 + j, y0], [-z0 + j, y0], [-z0 + j, y1], [-z1 + j, y1]], sh);
    if (!skip.includes('nx'))
      this.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), f.d(-1, 0, 0), [[z0 + j, y0], [z1 + j, y0], [z1 + j, y1], [z0 + j, y1]], sh);
    if (o.top !== false)
      this.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), [0, 1, 0], [[x0 + j, z1], [x1 + j, z1], [x1 + j, z0], [x0 + j, z0]]);
    if (o.bottom)
      this.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), [0, -1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [g, g, g, g]);
  }

  /** Appends another geometry (extrusions, domes, shapes), optionally transformed. */
  absorb(src: THREE.BufferGeometry, m?: THREE.Matrix4, opts: { boxUV?: boolean; shade?: number } = {}) {
    const g = src.index ? src.toNonIndexed() : src;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const t = g.getAttribute('uv');
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    const v = new THREE.Vector3();
    const w = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (m) v.applyMatrix4(m);
      w.fromBufferAttribute(n, i);
      if (nm) w.applyMatrix3(nm).normalize();
      const [u, uu] = opts.boxUV || !t ? boxUV(v, w) : [t.getX(i), t.getY(i)];
      this.vert([v.x, v.y, v.z], [w.x, w.y, w.z], u, uu, opts.shade ?? 1);
    }
    if (g !== src) g.dispose();
    src.dispose();
  }

  get size() {
    return this.pos.length / 3;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('flood', new THREE.Float32BufferAttribute(this.fl, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** The builders a structure writes into: dressed stone, dark openings, and windows lit at night. */
export interface Parts {
  stone: Builder;
  dark: Builder;
  glow: Builder;
}

// ---------- Profiles ----------

/** Rise of a pointed (two-centred) arch of span w; `point` 0.5 is a round arch. */
export function archRise(w: number, point = 0.72): number {
  const r = Math.max(point, 0.5) * w;
  return Math.sqrt(r * r - (r - w / 2) ** 2);
}

/** Outline of a pointed-arch opening, counter-clockwise in the wall's (x, y). */
export function archOutline(cx: number, y0: number, w: number, spring: number, point = 0.72, segs = 8): P2[] {
  const r = Math.max(point, 0.5) * w;
  const xl = cx - w / 2;
  const xr = cx + w / 2;
  const phi = Math.acos((r - w / 2) / r);
  const pts: P2[] = [
    [xl, y0],
    [xr, y0],
    [xr, spring],
  ];
  for (let k = 1; k <= segs; k++) {
    const a = (phi * k) / segs;
    pts.push([xr - r + r * Math.cos(a), spring + r * Math.sin(a)]);
  }
  for (let k = 1; k <= segs; k++) {
    const a = Math.PI - phi + (phi * k) / segs;
    pts.push([xl + r + r * Math.cos(a), spring + r * Math.sin(a)]);
  }
  return pts;
}

export const rectOutline = (x0: number, y0: number, x1: number, y1: number): P2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

const v2 = (pts: P2[]) => pts.map(([x, y]) => new THREE.Vector2(x, y));

export interface Opening {
  outline: P2[];
  depth: number;
  /** What the back of the recess is: stone (a portal), dark (a door) or glow (a window). */
  back: Builder;
  backShade?: number;
}

/**
 * A flat wall facing local +z at z = zf, pierced by openings. Every opening gets real reveals and
 * a back panel, so arches and windows are recessed and catch the low sun.
 */
export function facade(stone: Builder, f: Frame, zf: number, x0: number, x1: number, y0: number, y1: number, openings: Opening[]) {
  const shape = new THREE.Shape(v2(rectOutline(x0, y0, x1, y1)));
  for (const o of openings) shape.holes.push(new THREE.Path(v2(o.outline)));
  stone.absorb(new THREE.ShapeGeometry(shape, 1), f.matrix().multiply(new THREE.Matrix4().makeTranslation(0, 0, zf)));
  for (const o of openings) {
    const pts = o.outline;
    let run = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-4) continue;
      // Counter-clockwise outline: the inside of the opening is on the left of each edge.
      const n = f.d(-(by - ay) / len, (bx - ax) / len, 0);
      const zb = zf - o.depth;
      stone.quad(f.p(ax, ay, zf), f.p(bx, by, zf), f.p(bx, by, zb), f.p(ax, ay, zb), n, [[run, 0], [run + len, 0], [run + len, o.depth], [run, o.depth]], [0.8, 0.8, 0.6, 0.6]);
      run += len;
    }
    const back = new THREE.ShapeGeometry(new THREE.Shape(v2(pts)), 1);
    o.back.absorb(back, f.matrix().multiply(new THREE.Matrix4().makeTranslation(0, 0, zf - o.depth)), { shade: o.backShade ?? 0.72 });
  }
}

/** A row of merlons along local x, standing on y, between z0 and z1. */
export function merlons(b: Builder, f: Frame, x0: number, x1: number, z0: number, z1: number, y: number, o: { w?: number; gap?: number; h?: number } = {}) {
  const w = o.w ?? 1.05;
  const gap = o.gap ?? 0.85;
  const h = o.h ?? 1.7;
  const len = x1 - x0;
  const n = Math.max(1, Math.floor((len + gap) / (w + gap)));
  let x = x0 + (len - (n * w + (n - 1) * gap)) / 2;
  for (let i = 0; i < n; i++, x += w + gap) b.box(f, x, x + w, y, y + h, z0, z1, { grime: 0 });
}

/**
 * Machicolations along the top of a wall face (local x0..x1 at z = zf, facing +z): a parapet
 * carried out on corbels, crowned with merlons.
 */
export function machicolation(b: Builder, f: Frame, x0: number, x1: number, zf: number, y: number, o: { out?: number; band?: number; step?: number; crown?: boolean } = {}) {
  const out = o.out ?? 0.9;
  const band = o.band ?? 2.4;
  const n = Math.max(2, Math.round((x1 - x0) / (o.step ?? 1.45)));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    b.box(f, x - 0.26, x + 0.26, y, y + 1.1, zf - 0.05, zf + out, { grime: 0, top: false });
  }
  b.box(f, x0 - 0.35, x1 + 0.35, y + 1.1, y + 1.1 + band, zf - 0.05, zf + out, { grime: 0.06, bottom: true });
  if (o.crown !== false) merlons(b, f, x0 - 0.35, x1 + 0.35, zf + out - 0.7, zf + out, y + 1.1 + band);
}

/** An arrow slit: a narrow dark slot on a face at z = zf. */
export function slit(dark: Builder, f: Frame, x: number, y: number, zf: number, h = 1.9, w = 0.34) {
  dark.box(f, x - w / 2, x + w / 2, y, y + h, zf, zf + 0.05, { grime: 0, top: false, skip: ['nz'] });
}
