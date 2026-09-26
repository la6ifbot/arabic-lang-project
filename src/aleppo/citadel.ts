import * as THREE from 'three';
import { Builder, Frame, machicolation, merlons, slit, type Parts } from './builder';
import {
  BLOCK,
  CREST_Y,
  GATE_X,
  MOAT_W,
  MOAT_Y,
  NORTH,
  NORTH_T,
  RUN,
  WALL_IN,
  WALL_TOP,
  crestPoint,
  glacisOffset,
  glacisY,
  groundY,
  outward,
  plateauY,
  ringPoint,
} from './layout';
import { rng } from './random';

const TAU = Math.PI * 2;

/** Crest parameters at equal arc lengths (the ellipse is 1.8:1, so equal angles would bunch up). */
export function crestSamples(step: number): { ts: number[]; arc: number[]; total: number } {
  const N = 4096;
  const acc = [0];
  let prev = crestPoint(0);
  for (let i = 1; i <= N; i++) {
    const p = crestPoint((i / N) * TAU);
    acc.push(acc[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
    prev = p;
  }
  const total = acc[N];
  const n = Math.round(total / step);
  const ts: number[] = [];
  const arc: number[] = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const target = (i / n) * total;
    while (k < N - 1 && acc[k + 1] < target) k++;
    const f = (target - acc[k]) / (acc[k + 1] - acc[k]);
    ts.push(i === n ? TAU : ((k + f) / N) * TAU);
    arc.push(target);
  }
  return { ts, arc, total };
}

const rotFor = (t: number) => {
  const [nx, nz] = outward(t);
  return Math.atan2(nx, nz); // local +z points out of the citadel
};

/** Is a plan point inside the entrance block (plus a margin)? */
const inBlock = (x: number, z: number, m = 0) => x > BLOCK.x0 - m && x < BLOCK.x1 + m && z > BLOCK.z0 - m && z < BLOCK.z1 + m;

/**
 * The glacis: the stone-faced slope from the walls down to the moat floor, with UVs in metres
 * (u around the mound, v down the slope) so the courses of the facing run level.
 */
function glacis(nu = 26): THREE.BufferGeometry {
  const { ts } = crestSamples(2.6);
  const nt = ts.length - 1;
  const cols = nt + 1;
  const pos = new Float32Array(cols * (nu + 1) * 3);
  const uv = new Float32Array(cols * (nu + 1) * 2);
  const col = new Float32Array(cols * (nu + 1) * 3);
  // u runs along the middle of the slope for every row, so the joints don't shear.
  const mid: number[] = [0];
  for (let i = 1; i <= nt; i++) {
    const a = ringPoint(ts[i - 1], RUN / 2);
    const b = ringPoint(ts[i], RUN / 2);
    mid.push(mid[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  let slope = 0;
  let lastO = 0;
  let lastY = CREST_Y;
  for (let j = 0; j <= nu; j++) {
    const u = j / nu;
    const o = glacisOffset(u);
    const y = glacisY(u);
    slope += Math.hypot(o - lastO, y - lastY);
    lastO = o;
    lastY = y;
    for (let i = 0; i <= nt; i++) {
      const k = j * cols + i;
      const [x, z] = ringPoint(ts[i], o);
      pos.set([x, y, z], k * 3);
      uv.set([mid[i], -slope], k * 2);
      // Dirt gathers at the foot; a few broad tonal swells across the facing.
      const swell = 0.95 + 0.05 * Math.sin(ts[i] * 7 + 1.3) * Math.cos(u * 4 + ts[i] * 3);
      const foot = 0.8 + 0.2 * Math.min(1, (1 - u) * 4);
      const s = swell * foot;
      col.set([s, s * 0.985, s * 0.96], k * 3);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nu; j++)
    for (let i = 0; i < nt; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('flood', new THREE.BufferAttribute(new Float32Array(cols * (nu + 1)).fill(1), 1));
  g.setIndex(index);
  g.computeVertexNormals();
  // Stitch the seam: both copies of the first column share one normal.
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let j = 0; j <= nu; j++) {
    const a = j * cols;
    const b = a + nt;
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
  // Make sure the glacis faces out of the mound.
  const [x0, , z0] = [pos[0], pos[1], pos[2]];
  if (n.getX(0) * x0 + n.getZ(0) * z0 < 0) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    g.setIndex(index);
    g.computeVertexNormals();
  }
  return g;
}

const lin = (hex: string) => new THREE.Color(hex);

/** The plateau: packed earth and dry grass, a paved way from the gate to the Great Mosque. */
function plateau(rings = 16): THREE.BufferGeometry {
  const { ts } = crestSamples(4);
  const nt = ts.length - 1;
  const cols = nt + 1;
  const pos: number[] = [];
  const col: number[] = [];
  const earth = lin('#b6a283');
  const grass = lin('#9c9468');
  const paving = lin('#cdbf9f');
  const c = new THREE.Color();
  for (let k = 0; k <= rings; k++) {
    const s = 1 - k / rings;
    for (let i = 0; i <= nt; i++) {
      const [cx, cz] = ringPoint(ts[i], k === 0 ? 1.5 : 0);
      const x = cx * s;
      const z = cz * s;
      pos.push(x, plateauY(x, z) - (k === 0 ? 0.6 : 0), z);
      const patchy = 0.5 + 0.25 * Math.sin(x * 0.05 + Math.cos(z * 0.07) * 2) + 0.25 * Math.sin(x * 0.11 - z * 0.09 + 1.3);
      c.copy(earth).lerp(grass, patchy * 0.9);
      const path = Math.abs(x - GATE_X - 5 * Math.sin(z / 30)) < 4.5 && z > -15 && z < BLOCK.z0 + 2;
      if (path) c.copy(paving);
      col.push(c.r, c.g, c.b);
    }
  }
  const index: number[] = [];
  for (let k = 0; k < rings; k++)
    for (let i = 0; i < nt; i++) {
      const a = k * cols + i;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  if (g.getAttribute('normal').getY(cols * 2) < 0) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    g.setIndex(index);
    g.computeVertexNormals();
  }
  return g;
}

/** The moat floor: a ring of dry grass between the glacis and the counterscarp. */
function moatFloor(): THREE.BufferGeometry {
  const { ts } = crestSamples(4);
  const pos: number[] = [];
  const col: number[] = [];
  const a = lin('#8f8a5c');
  const b = lin('#a39a73');
  const c = new THREE.Color();
  const ring = [RUN - 0.5, RUN + MOAT_W * 0.5, RUN + MOAT_W + 0.5];
  for (let i = 0; i < ts.length - 1; i++) {
    for (let r = 0; r < ring.length - 1; r++) {
      const quad = [
        [ts[i], ring[r]],
        [ts[i + 1], ring[r]],
        [ts[i + 1], ring[r + 1]],
        [ts[i], ring[r + 1]],
      ].map(([t, o]) => ringPoint(t, o));
      for (const k of [0, 2, 1, 0, 3, 2]) {
        const [x, z] = quad[k];
        pos.push(x, MOAT_Y, z);
        c.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(x * 0.04 + z * 0.03));
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  if (g.getAttribute('normal').getY(0) < 0) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const cc = g.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 3) {
      for (const attr of [p, cc]) {
        const t = [attr.getX(i + 1), attr.getY(i + 1), attr.getZ(i + 1)];
        attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
        attr.setXYZ(i + 2, t[0], t[1], t[2]);
      }
    }
    g.computeVertexNormals();
  }
  return g;
}

/** The counterscarp: the moat's outer retaining wall, with a low parapet along the street. */
function counterscarp(b: Builder) {
  const { ts, arc } = crestSamples(3);
  const o = RUN + MOAT_W;
  b.flood = 0;
  b.tint.set('#d8ccb4');
  for (let i = 0; i < ts.length - 1; i++) {
    const [ax, az] = ringPoint(ts[i], o);
    const [bx, bz] = ringPoint(ts[i + 1], o);
    const [cx, cz] = ringPoint(ts[i + 1], o + 0.7);
    const [dx, dz] = ringPoint(ts[i], o + 0.7);
    const [nx, nz] = outward(ts[i]);
    const u0 = arc[i];
    const u1 = arc[i + 1];
    b.quad([ax, MOAT_Y, az], [bx, MOAT_Y, bz], [bx, 0.9, bz], [ax, 0.9, az], [-nx, 0, -nz], [[u0, MOAT_Y], [u1, MOAT_Y], [u1, 0.9], [u0, 0.9]], [0.72, 0.72, 1, 1]);
    b.quad([ax, 0.9, az], [bx, 0.9, bz], [cx, 0.9, cz], [dx, 0.9, dz], [0, 1, 0], [[u0, 0], [u1, 0], [u1, 0.7], [u0, 0.7]]);
    b.quad([dx, 0, dz], [cx, 0, cz], [cx, 0.9, cz], [dx, 0.9, dz], [nx, 0, nz], [[u0, 0], [u1, 0], [u1, 0.9], [u0, 0.9]]);
  }
}

/** Merlons around the top of a rectangular tower (local x0..x1, z0..z1). */
function crown(b: Builder, f: Frame, x0: number, x1: number, z0: number, z1: number, y: number) {
  merlons(b, f, x0, x1, z1 - 0.8, z1, y);
  merlons(b, f, x0, x1, z0, z0 + 0.8, y);
  const step = 1.9;
  const n = Math.max(1, Math.floor((z1 - z0 - 1.6) / step));
  for (let i = 0; i < n; i++) {
    const zc = z0 + 0.8 + ((z1 - z0 - 1.6) * (i + 0.5)) / n;
    b.box(f, x1 - 0.8, x1, y, y + 1.7, zc - 0.52, zc + 0.52, { grime: 0 });
    b.box(f, x0, x0 + 0.8, y, y + 1.7, zc - 0.52, zc + 0.52, { grime: 0 });
  }
}

interface TowerSpec {
  w: number; // along the wall
  out: number; // projection beyond the wall's outer face
  top: number;
  machicolated: boolean;
}

/** A square wall tower: its outer part stands on the glacis, the rest rises from the wall walk. */
function tower(p: Parts, f: Frame, s: TowerSpec) {
  const { stone, dark } = p;
  const x0 = -s.w / 2;
  const x1 = s.w / 2;
  const z0 = -WALL_IN - 1;
  const z1 = s.out;
  stone.box(f, x0, x1, CREST_Y - 16, s.top, z0, z1, { grime: 0.22 });
  if (s.machicolated) {
    machicolation(stone, f, x0 + 0.4, x1 - 0.4, z1, s.top - 1.1, { band: 2.2 });
    crown(stone, f, x0, x1, z0, z1 - 0.9, s.top);
  } else {
    // A string course, then the crown.
    stone.box(f, x0 - 0.25, x1 + 0.25, s.top - 0.45, s.top, z0, z1 + 0.25, { grime: 0, top: false, bottom: true });
    crown(stone, f, x0, x1, z0, z1, s.top);
  }
  for (const y of [s.top - 8.5, s.top - 14]) {
    if (y < CREST_Y - 2) continue;
    slit(dark, f, -s.w / 4, y, z1);
    slit(dark, f, s.w / 4, y, z1);
  }
  const east = f.child(0, 0, Math.PI / 2);
  const west = f.child(0, 0, -Math.PI / 2);
  slit(dark, east, -(z0 + z1) / 2, s.top - 9, x1);
  slit(dark, west, (z0 + z1) / 2, s.top - 9, -x0);
}

/**
 * The curtain wall along the crest with its towers and merlons. Returns the arc positions of the
 * towers (label anchors use one).
 */
function walls(p: Parts): { t: number; spec: TowerSpec }[] {
  const { stone } = p;
  const r = rng(7);
  const { ts, arc, total } = crestSamples(2.4);
  const at = (s: number) => {
    const i = Math.min(ts.length - 2, Math.max(0, arc.findIndex((a) => a > s) - 1));
    const f = (s - arc[i]) / (arc[i + 1] - arc[i]);
    return ts[i] + (ts[i + 1] - ts[i]) * f;
  };

  // Towers every ~26 m, none inside the entrance block (it is a tower in itself).
  const towers: { t: number; s: number; spec: TowerSpec }[] = [];
  const count = Math.round(total / 26);
  for (let i = 0; i < count; i++) {
    const s = ((i + 0.3) / count) * total;
    const t = at(s);
    const [x, z] = crestPoint(t);
    if (inBlock(x, z, 7)) continue;
    const spec: TowerSpec = {
      w: r.range(9.5, 13),
      out: r.range(5, 7.5),
      top: WALL_TOP + r.range(3.5, 6.5),
      machicolated: i % 3 === 0,
    };
    towers.push({ t, s, spec });
  }

  stone.flood = 1;
  const tint = new THREE.Color();
  for (let i = 0; i < ts.length - 1; i++) {
    const [ax, az] = crestPoint(ts[i]);
    const [bx, bz] = crestPoint(ts[i + 1]);
    if (inBlock(ax, az, -1) && inBlock(bx, bz, -1)) continue;
    const [nax, naz] = outward(ts[i]);
    const [nbx, nbz] = outward(ts[i + 1]);
    const ex = bx - ax;
    const ez = bz - az;
    const len = Math.hypot(ex, ez);
    let nx = ez / len;
    let nz = -ex / len;
    if (nx * nax + nz * naz < 0) [nx, nz] = [-nx, -nz];
    // Repairs of different centuries show as slightly different stone.
    const k = 0.95 + 0.05 * Math.sin(ts[i] * 5 + 0.4) + 0.03 * Math.sin(ts[i] * 13);
    tint.setRGB(k, k * 0.985, k * 0.955);
    stone.tint.copy(tint);
    const u0 = arc[i];
    const u1 = arc[i + 1];
    const ia: [number, number] = [ax - nax * WALL_IN, az - naz * WALL_IN];
    const ib: [number, number] = [bx - nbx * WALL_IN, bz - nbz * WALL_IN];
    stone.quad([ax, CREST_Y - 4, az], [bx, CREST_Y - 4, bz], [bx, WALL_TOP, bz], [ax, WALL_TOP, az], [nx, 0, nz], [[u0, CREST_Y - 4], [u1, CREST_Y - 4], [u1, WALL_TOP], [u0, WALL_TOP]], [0.8, 0.8, 1, 1]);
    const yi = Math.min(plateauY(ia[0], ia[1]), plateauY(ib[0], ib[1])) - 0.5;
    stone.quad([ia[0], yi, ia[1]], [ib[0], yi, ib[1]], [ib[0], WALL_TOP, ib[1]], [ia[0], WALL_TOP, ia[1]], [-nx, 0, -nz], [[-u0, yi], [-u1, yi], [-u1, WALL_TOP], [-u0, WALL_TOP]], [0.85, 0.85, 1, 1]);
    stone.quad([ax, WALL_TOP, az], [bx, WALL_TOP, bz], [ib[0], WALL_TOP, ib[1]], [ia[0], WALL_TOP, ia[1]], [0, 1, 0], [[u0, 0], [u1, 0], [u1, WALL_IN], [u0, WALL_IN]], [0.92, 0.92, 0.92, 0.92]);
  }

  // Merlons along the outer edge, except where a tower stands.
  stone.tint.set('#f4efe6');
  for (let s = 0.9; s < total; s += 1.9) {
    if (towers.some((tw) => Math.abs(tw.s - s) < tw.spec.w / 2 + 0.6)) continue;
    const t = at(s);
    const [x, z] = crestPoint(t);
    if (inBlock(x, z, 0.5)) continue;
    const f = new Frame(x, z, rotFor(t));
    stone.box(f, -0.52, 0.52, WALL_TOP, WALL_TOP + 1.7, -0.8, 0, { grime: 0 });
  }

  for (const tw of towers) {
    const [x, z] = crestPoint(tw.t);
    const k = r.range(0.93, 1.03);
    stone.tint.setRGB(k, k * r.range(0.97, 1), k * r.range(0.93, 0.98));
    tower(p, new Frame(x, z, rotFor(tw.t)), tw.spec);
  }
  return towers;
}

/** The northern Mamluk tower, part-way down the north glacis, and its stepped passage up. */
function northTower(p: Parts) {
  const { stone, dark } = p;
  const t = NORTH_T;
  const [x, z] = ringPoint(t, NORTH.offset);
  const f = new Frame(x, z, rotFor(t));
  const h = NORTH.half;
  stone.flood = 1;
  stone.tint.setRGB(1.02, 0.99, 0.94);
  stone.box(f, -h, h, MOAT_Y - 1, NORTH.top, -h, h, { grime: 0.28 });
  machicolation(stone, f, -h + 0.5, h - 0.5, h, NORTH.top - 1.1, { band: 2.3 });
  const east = f.child(0, 0, Math.PI / 2);
  const west = f.child(0, 0, -Math.PI / 2);
  machicolation(stone, east, -h + 0.5, h - 0.5, h, NORTH.top - 1.1, { band: 2.3 });
  machicolation(stone, west, -h + 0.5, h - 0.5, h, NORTH.top - 1.1, { band: 2.3 });
  merlons(stone, f, -h, h, -h, -h + 0.8, NORTH.top);
  for (const y of [NORTH.top - 8, NORTH.top - 14, NORTH.top - 20]) {
    for (const fx of [-h / 2, h / 2]) {
      slit(dark, f, fx, y, h);
      slit(dark, east, fx, y, h);
      slit(dark, west, fx, y, h);
    }
  }
  // A walled stair climbs from the tower's back to the crest.
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const o0 = NORTH.offset - h - ((NORTH.offset - h) * i) / steps;
    const o1 = NORTH.offset - h - ((NORTH.offset - h) * (i + 1)) / steps;
    const [ax, az] = ringPoint(t, o0);
    const [bx, bz] = ringPoint(t, o1);
    const gy = Math.max(groundY(ax, az), groundY(bx, bz));
    const sf = new Frame((ax + bx) / 2, (az + bz) / 2, rotFor(t));
    const half = Math.hypot(bx - ax, bz - az) / 2 + 0.3;
    stone.box(sf, -2.6, 2.6, gy - 6, gy + 5, -half, half, { grime: 0.2 });
  }
}

/** Low, invisible stand-ins for the mound, used to hide labels behind it. */
function colliders(): THREE.Mesh[] {
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const out: THREE.Mesh[] = [];
  const nt = 48;
  const nu = 5;
  const pos: number[] = [];
  // Wall walk, the wall's outer face, then the glacis down to the moat.
  const prof = [
    { o: -WALL_IN, y: WALL_TOP },
    { o: 0, y: WALL_TOP },
    ...Array.from({ length: nu + 1 }, (_, j) => ({ o: glacisOffset(j / nu), y: glacisY(j / nu) })),
  ];
  for (let i = 0; i < nt; i++) {
    const t0 = (i / nt) * TAU;
    const t1 = ((i + 1) / nt) * TAU;
    for (let j = 0; j < prof.length - 1; j++) {
      const a = ringPoint(t0, prof[j].o);
      const b = ringPoint(t1, prof[j].o);
      const c = ringPoint(t1, prof[j + 1].o);
      const d = ringPoint(t0, prof[j + 1].o);
      pos.push(a[0], prof[j].y, a[1], b[0], prof[j].y, b[1], c[0], prof[j + 1].y, c[1]);
      pos.push(a[0], prof[j].y, a[1], c[0], prof[j + 1].y, c[1], d[0], prof[j + 1].y, d[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.push(new THREE.Mesh(g, mat));
  const block = new THREE.Mesh(new THREE.BoxGeometry(BLOCK.x1 - BLOCK.x0, BLOCK.top - BLOCK.y0, BLOCK.z1 - BLOCK.z0), mat);
  block.position.set((BLOCK.x0 + BLOCK.x1) / 2, (BLOCK.top + BLOCK.y0) / 2, (BLOCK.z0 + BLOCK.z1) / 2);
  out.push(block);
  for (const m of out) m.updateMatrixWorld(true);
  return out;
}

export interface Mound {
  glacis: THREE.BufferGeometry;
  plateau: THREE.BufferGeometry;
  moat: THREE.BufferGeometry;
  colliders: THREE.Mesh[];
  /** Crest angle of a tower suitable for the "walls" label. */
  wallTower: number;
}

/** Everything that belongs to the mound itself: slope, plateau, moat, walls and towers. */
export function buildMound(p: Parts): Mound {
  counterscarp(p.stone);
  const towers = walls(p);
  northTower(p);
  // A tower on the south-east, well in view from the default camera.
  const se = towers.reduce((best, tw) => {
    const [x, z] = crestPoint(tw.t);
    const score = Math.abs(x - 95) + Math.abs(z - 45);
    const [bx, bz] = crestPoint(best.t);
    return score < Math.abs(bx - 95) + Math.abs(bz - 45) ? tw : best;
  });
  return { glacis: glacis(), plateau: plateau(), moat: moatFloor(), colliders: colliders(), wallTower: se.t };
}
