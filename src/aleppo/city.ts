import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { archOutline, facade, Frame, merlons, slit, type Opening, type Parts } from './builder';
import { crestSamples } from './citadel';
import { GATE_X, LOWER, MOAT_W, MOAT_Y, RUN, crestOffset, groundY, ringPoint } from './layout';
import type { Materials } from './materials';
import { rng, type Rng } from './random';

const STREET_IN = RUN + MOAT_W + 0.7; // just outside the counterscarp coping
const ROAD_OUT = STREET_IN + 24; // the ring road around the moat
const HOUSES_IN = ROAD_OUT + 8;
/** The Great Mosque of Aleppo, about 500 m west of the citadel. */
const UMAYYAD = { x: -520, z: 36, w: 105, d: 78 };

/** The open square south of the citadel, in front of the lower tower. */
const inEsplanade = (x: number, z: number) => x > -115 && x < 85 && z > LOWER.z - 30 && z < 300;
const inMosqueSite = (x: number, z: number) => Math.abs(x - UMAYYAD.x) < UMAYYAD.w / 2 + 14 && Math.abs(z - UMAYYAD.z) < UMAYYAD.d / 2 + 14;
const AVENUES = [0.32, 1.22, 2.36, 3.02, 3.74, 4.58, 5.46];

function onAvenue(x: number, z: number) {
  const d = Math.hypot(x, z);
  for (const a of AVENUES) {
    const ax = Math.cos(a);
    const az = Math.sin(a);
    const along = x * ax + z * az;
    if (along > 0 && Math.abs(-x * az + z * ax) < 7 + d * 0.004) return true;
  }
  return Math.abs(d - 520) < 6 || Math.abs(d - 930) < 7;
}

/** Streets, pavements, the ring road and the esplanade, fading out into the plain. */
function ground(): THREE.BufferGeometry {
  const { ts } = crestSamples(5);
  const offsets = [RUN + MOAT_W, STREET_IN, STREET_IN + 3.5, ROAD_OUT - 3.5, ROAD_OUT];
  for (let o = ROAD_OUT + 12; o < 420; o += 14) offsets.push(o);
  for (const o of [480, 600, 800, 1100, 1500, 2100, 3000, 4400, 6500]) offsets.push(o);
  const colours = {
    coping: new THREE.Color('#cdbf9f'),
    pavement: new THREE.Color('#c2b395'),
    road: new THREE.Color('#766f65'),
    square: new THREE.Color('#d3c6a6'),
    city: new THREE.Color('#ad9d80'),
    plain: new THREE.Color('#a39478'),
  };
  const cols = ts.length;
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const o of offsets) {
    for (let i = 0; i < cols; i++) {
      const [x, z] = ringPoint(ts[i], o);
      pos.push(x, 0, z);
      if (o <= STREET_IN) c.copy(colours.coping);
      else if (o <= STREET_IN + 3.5 || (o >= ROAD_OUT - 3.5 && o < ROAD_OUT + 1)) c.copy(colours.pavement);
      else if (o < ROAD_OUT) c.copy(colours.road);
      else if (inEsplanade(x, z) || inMosqueSite(x, z)) c.copy(colours.square);
      else c.copy(colours.city).lerp(colours.plain, Math.min(1, o / 2000));
      col.push(c.r, c.g, c.b);
    }
  }
  const index: number[] = [];
  for (let k = 0; k < offsets.length - 1; k++)
    for (let i = 0; i < cols - 1; i++) {
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
  if (g.getAttribute('normal').getY(cols + 1) < 0) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    g.setIndex(index);
    g.computeVertexNormals();
  }
  return g;
}

/** Unit box standing on y = 0: pale walls, darker flat roof. */
function houseGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const n = g.getAttribute('normal');
  const p = g.getAttribute('position');
  const col: number[] = [];
  for (let i = 0; i < n.count; i++) {
    if (n.getY(i) > 0.5) col.push(0.8, 0.78, 0.74);
    else {
      const s = p.getY(i) < 0.5 ? 0.84 : 1;
      col.push(s, s, s);
    }
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function treeGeometry(kind: 'round' | 'cypress'): THREE.BufferGeometry {
  const crown = kind === 'round' ? new THREE.IcosahedronGeometry(1, 1).scale(1, 0.85, 1).translate(0, 2.1, 0) : new THREE.ConeGeometry(0.62, 3.6, 7).translate(0, 2.5, 0);
  const trunk = new THREE.CylinderGeometry(0.1, 0.15, 1.5, 5).translate(0, 0.75, 0);
  const paint = (g: THREE.BufferGeometry, hex: string, spread: number, seed: number) => {
    const r = rng(seed);
    const flat = g.index ? g.toNonIndexed() : g;
    const base = new THREE.Color(hex);
    const col: number[] = [];
    for (let i = 0; i < flat.getAttribute('position').count; i += 3) {
      const k = 1 + (r.next() - 0.5) * spread;
      for (let j = 0; j < 3; j++) col.push(base.r * k, base.g * k, base.b * k);
    }
    flat.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return flat;
  };
  const merged = mergeGeometries([paint(crown, kind === 'round' ? '#5e7040' : '#3f5634', 0.35, 3), paint(trunk, '#6b5842', 0.2, 5)]);
  merged.computeVertexNormals();
  return merged;
}

/** The Great Mosque of Aleppo: a walled court, the prayer hall and its tall square minaret. */
function umayyad(p: Parts) {
  const { stone, dark, glow } = p;
  const f = new Frame(UMAYYAD.x, UMAYYAD.z, 0.02);
  const hw = UMAYYAD.w / 2;
  const hd = UMAYYAD.d / 2;
  stone.flood = 2;
  stone.tint.setRGB(1.0, 0.97, 0.92);
  stone.box(f, -hw, hw, -1, 12, -hd, -hd + 1.8, { grime: 0.2 });
  stone.box(f, -hw, -hw + 1.8, -1, 12, -hd, hd, { grime: 0.2 });
  stone.box(f, hw - 1.8, hw, -1, 12, -hd, hd, { grime: 0.2 });
  const hall = hd - 26;
  stone.box(f, -hw, hw, -1, 15, hall, hd, { grime: 0.2, skip: ['nz'] });
  facade(
    stone,
    f.child(0, 0, Math.PI),
    -hall,
    -hw,
    hw,
    -1,
    15,
    Array.from({ length: 13 }, (_, i): Opening => ({ outline: archOutline(-42 + i * 7, 0, 3.8, 4.4), depth: 1.6, back: dark, backShade: 1 })),
  );
  stone.box(f, -hw - 0.3, hw + 0.3, 15, 15.6, hall - 0.3, hd + 0.3, { grime: 0, bottom: true });
  stone.tint.setRGB(0.95, 0.93, 0.88);
  const [dx, , dz] = f.p(0, 0, (hall + hd) / 2);
  stone.absorb(new THREE.CylinderGeometry(7.4, 7.4, 3, 8, 1, true), new THREE.Matrix4().makeTranslation(dx, 17.1, dz), { boxUV: true });
  stone.absorb(new THREE.SphereGeometry(7, 20, 7, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(dx, 18.6, dz), { boxUV: true });
  stone.tint.setRGB(1.08, 1.05, 0.99);
  stone.box(f, -hw + 1.8, hw - 1.8, -1, 0.12, -hd + 1.8, hall, { grime: 0, skip: ['px', 'nx', 'pz', 'nz'] });

  // The minaret (Seljuk, 1090), 45 m, at the north-west corner of the court.
  const m = f.child(-hw + 3, -hd + 3, 0);
  const h = 2.6;
  const sides = [m, m.child(0, 0, Math.PI / 2), m.child(0, 0, Math.PI), m.child(0, 0, -Math.PI / 2)];
  stone.tint.setRGB(1.04, 0.99, 0.91);
  stone.box(m, -h, h, -1, 27, -h, h, { grime: 0.12 });
  for (const [y0, y1] of [
    [27, 34.5],
    [35.2, 41.5],
  ]) {
    stone.box(m, -h - 0.3, h + 0.3, y0 - 0.7, y0, -h - 0.3, h + 0.3, { grime: 0, bottom: true });
    for (const s of sides) facade(stone, s, h, -h, h, y0, y1, [-1.2, 1.2].map((x): Opening => ({ outline: archOutline(x, y0 + 1.4, 1.2, y1 - 2.4), depth: 0.6, back: glow, backShade: 1 })));
  }
  stone.box(m, -h - 0.5, h + 0.5, 41.5, 42.4, -h - 0.5, h + 0.5, { grime: 0, bottom: true });
  for (const s of sides) merlons(stone, s, -h - 0.5, h - 0.2, h - 0.2, h + 0.5, 42.4, { w: 0.6, gap: 0.55, h: 0.9 });
  stone.box(m, -1.5, 1.5, 42.4, 45, -1.5, 1.5, { grime: 0 });
  for (const s of sides) slit(dark, s, 0, 14, h, 2.2, 0.36);
}

/** A slender city minaret: cylinder, balcony, lantern and cone, ~28 m. */
function minaretGeometry(): THREE.BufferGeometry {
  const parts = [
    new THREE.CylinderGeometry(1.25, 1.55, 21, 8).translate(0, 10.5, 0),
    new THREE.CylinderGeometry(2.1, 1.4, 1.2, 8).translate(0, 21.6, 0),
    new THREE.CylinderGeometry(0.95, 0.95, 4.2, 8).translate(0, 24.3, 0),
    new THREE.ConeGeometry(1.15, 3.6, 8).translate(0, 28.2, 0),
  ].map((g) => {
    const flat = g.toNonIndexed();
    flat.deleteAttribute('uv');
    return flat;
  });
  const g = mergeGeometries(parts);
  const col = new Float32Array(g.getAttribute('position').count * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

interface House {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
}

function placeHouses(r: Rng, quality: 'high' | 'low'): House[] {
  const out: House[] = [];
  const old = quality === 'high' ? 820 : 620;
  const grid = (cell: number, rMin: number, rMax: number, make: (x: number, z: number, dist: number) => House | null) => {
    for (let gx = -rMax; gx <= rMax; gx += cell)
      for (let gz = -rMax; gz <= rMax; gz += cell) {
        const x = gx + r.range(-0.22, 0.22) * cell;
        const z = gz + r.range(-0.22, 0.22) * cell;
        const dist = Math.hypot(x, z);
        if (dist > rMax || dist < rMin) continue;
        if (crestOffset(x, z) < HOUSES_IN + r.range(0, 6)) continue;
        if (inEsplanade(x, z) || inMosqueSite(x, z) || onAvenue(x, z)) continue;
        const h = make(x, z, dist);
        if (h) out.push(h);
      }
  };
  // The old city: dense, low courtyard houses whose streets turn with each quarter.
  grid(19, 0, old, (x, z, dist) => {
    if (r.chance(0.06)) return null;
    const quarter = 0.35 * Math.sin(Math.atan2(z, x) * 3 + 0.8) + 0.25 * Math.sin(dist / 160);
    return { x, z, w: r.range(10, 17.5), d: r.range(10, 17.5), h: r.chance(0.2) ? r.range(9, 13) : r.range(4.5, 9), rot: quarter + r.range(-0.08, 0.08) };
  });
  if (quality === 'high') {
    // Newer districts beyond: bigger, taller blocks, thinning into the haze.
    grid(38, old, 1750, (x, z, dist) => {
      if (r.chance(0.28 + (dist - old) / 3000)) return null;
      return { x, z, w: r.range(16, 30), d: r.range(14, 26), h: r.range(10, 26), rot: 0.3 * Math.sin(Math.atan2(z, x) * 2) + r.range(-0.05, 0.05) };
    });
  }
  return out;
}

export interface City {
  group: THREE.Group;
  lights: THREE.Points;
}

const tmp = new THREE.Object3D();
const tint = new THREE.Color();

/** The city around the citadel: streets, houses, domes, minarets, trees, and its lights at night. */
export function buildCity(p: Parts, mats: Materials, quality: 'high' | 'low', plateauTrees: [number, number, number][], sprite: THREE.Texture): City {
  const r = rng(101);
  const group = new THREE.Group();
  group.name = 'city';

  const floor = new THREE.Mesh(ground(), mats.ground);
  floor.receiveShadow = true;
  group.add(floor);

  umayyad(p);

  // Houses and the clutter on their roofs.
  const houses = placeHouses(r, quality);
  const roofs = houses.filter(() => r.chance(0.35));
  const hm = new THREE.InstancedMesh(houseGeometry(), mats.house, houses.length + roofs.length);
  const stones = ['#dccdb0', '#e6dccb', '#c9bca3', '#d8c19b', '#cfc4b0', '#bfb29a'].map((c) => new THREE.Color(c));
  let n = 0;
  for (const h of houses) {
    tmp.position.set(h.x, 0, h.z);
    tmp.rotation.set(0, h.rot, 0);
    tmp.scale.set(h.w, h.h, h.d);
    tmp.updateMatrix();
    hm.setMatrixAt(n, tmp.matrix);
    tint.copy(r.pick(stones)).lerp(stones[0], r.next() * 0.5);
    hm.setColorAt(n++, tint);
  }
  for (const h of roofs) {
    const s = r.range(2.5, 4.5);
    tmp.position.set(h.x + r.range(-0.3, 0.3) * h.w, h.h, h.z + r.range(-0.3, 0.3) * h.d);
    tmp.rotation.set(0, h.rot, 0);
    tmp.scale.set(s, r.range(1.6, 2.8), s * r.range(0.8, 1.3));
    tmp.updateMatrix();
    hm.setMatrixAt(n, tmp.matrix);
    hm.setColorAt(n++, tint.copy(r.pick(stones)).multiplyScalar(0.94));
  }
  hm.castShadow = true;
  hm.receiveShadow = true;
  group.add(hm);

  // Domes of mosques, baths and khans; the cluster by the esplanade stands in for the great hammam.
  const domeSpots: [number, number, number, number][] = [];
  for (const h of houses) if (Math.hypot(h.x, h.z) < 900 && r.chance(0.035)) domeSpots.push([h.x, h.h, h.z, Math.min(h.w, h.d) * r.range(0.28, 0.4)]);
  for (const [x, z, rad] of [
    [-150, 212, 5.5],
    [-142, 200, 3.4],
    [-160, 199, 3.4],
    [-135, 222, 3],
    [-166, 224, 3],
  ])
    domeSpots.push([x, 7, z, rad]);
  const domeGeo = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(domeGeo.getAttribute('position').count * 3).fill(1), 3));
  const dm = new THREE.InstancedMesh(domeGeo, mats.house, domeSpots.length);
  domeSpots.forEach(([x, y, z, rad], i) => {
    tmp.position.set(x, y, z);
    tmp.rotation.set(0, 0, 0);
    tmp.scale.set(rad, rad * 0.95, rad);
    tmp.updateMatrix();
    dm.setMatrixAt(i, tmp.matrix);
    dm.setColorAt(i, tint.set(r.chance(0.3) ? '#a9a7a0' : '#d9ccb2'));
  });
  dm.castShadow = true;
  group.add(dm);
  // The hammam's hall under that cluster.
  p.stone.flood = 0;
  p.stone.tint.setRGB(1, 0.97, 0.92);
  p.stone.box(new Frame(-150, 211, 0.1), -20, 20, -0.5, 7, -16, 16, { grime: 0.2 });

  // City minarets.
  const spots = houses.filter((h) => Math.hypot(h.x, h.z) < 800 && h.h < 9).filter(() => r.chance(0.012));
  const mm = new THREE.InstancedMesh(minaretGeometry(), mats.house, spots.length);
  spots.forEach((h, i) => {
    tmp.position.set(h.x + h.w * 0.3, 0, h.z + h.d * 0.3);
    tmp.rotation.set(0, r.next(), 0);
    const s = r.range(0.85, 1.15);
    tmp.scale.set(s, s, s);
    tmp.updateMatrix();
    mm.setMatrixAt(i, tmp.matrix);
    mm.setColorAt(i, tint.set('#e2d5ba'));
  });
  mm.castShadow = true;
  group.add(mm);

  // Trees: along the ring road, in rows on the esplanade, on the plateau, a few in the moat and courtyards.
  const round: [number, number, number, number][] = [];
  const cypress: [number, number, number, number][] = [];
  const { ts } = crestSamples(17);
  for (const t of ts) {
    const [x, z] = ringPoint(t, ROAD_OUT + 3);
    if (!inEsplanade(x, z)) round.push([x, 0, z, r.range(2.6, 3.6)]);
  }
  for (let x = -100; x <= 70; x += 17)
    for (let z = LOWER.z + 30; z <= 285; z += 19) if (Math.abs(x - GATE_X) > 22 && r.chance(0.8)) round.push([x + r.range(-2, 2), 0, z + r.range(-2, 2), r.range(2.8, 3.8)]);
  for (const [x, y, z] of plateauTrees) (r.chance(0.5) ? cypress : round).push([x, y, z, r.range(2.2, 3.2)]);
  for (let i = 0; i < 40; i++) {
    const t = r.range(-0.6, 2.4);
    const [x, z] = ringPoint(t, RUN + r.range(4, MOAT_W - 3));
    if (Math.abs(x - GATE_X) > 14) round.push([x, MOAT_Y, z, r.range(2.4, 3.4)]);
  }
  for (let i = 0; i < (quality === 'high' ? 420 : 160); i++) {
    const h = r.pick(houses);
    const x = h.x + h.w * 0.62;
    const z = h.z + r.range(-0.3, 0.3) * h.d;
    if (Math.hypot(x, z) < 900 && crestOffset(x, z) > HOUSES_IN) (r.chance(0.3) ? cypress : round).push([x, 0, z, r.range(2, 3.2)]);
  }
  for (const [list, kind] of [
    [round, 'round'],
    [cypress, 'cypress'],
  ] as const) {
    const tm = new THREE.InstancedMesh(treeGeometry(kind), mats.foliage, list.length);
    list.forEach(([x, y, z, s], i) => {
      tmp.position.set(x, y, z);
      tmp.rotation.set(0, r.next() * 6.3, 0);
      tmp.scale.set(s, s * r.range(0.9, 1.25), s);
      tmp.updateMatrix();
      tm.setMatrixAt(i, tmp.matrix);
    });
    tm.castShadow = true;
    group.add(tm);
  }

  // Lights for the night: windows, street lamps, and the floodlight fixtures around the mound.
  const pos: number[] = [];
  const col: number[] = [];
  const warm = new THREE.Color('#ffc987');
  const sodium = new THREE.Color('#ff9f45');
  const flood = new THREE.Color('#ffd49a');
  const add = (x: number, y: number, z: number, c: THREE.Color, k = 1) => {
    pos.push(x, y, z);
    col.push(c.r * k, c.g * k, c.b * k);
  };
  for (const h of houses) {
    if (!r.chance(Math.hypot(h.x, h.z) < 900 ? 0.55 : 0.3)) continue;
    const side = r.pick([-1, 1]);
    const lx = side * (h.w / 2 + 0.4);
    const lz = r.range(-0.4, 0.4) * h.d;
    const c = Math.cos(h.rot);
    const s = Math.sin(h.rot);
    add(h.x + lx * c + lz * s, r.range(2, Math.max(2.5, h.h - 1)), h.z - lx * s + lz * c, warm, r.range(0.55, 1));
  }
  for (const t of crestSamples(20).ts) {
    const [x, z] = ringPoint(t, ROAD_OUT - 1.5);
    add(x, 7, z, sodium);
  }
  for (let x = -100; x <= 70; x += 26) for (let z = LOWER.z + 25; z <= 290; z += 26) add(x, 5, z, sodium, 0.9);
  for (const t of crestSamples(11).ts) {
    const [x, z] = ringPoint(t, RUN - 1.5);
    add(x, MOAT_Y + 0.6, z, flood, 1.1);
    const [cx, cz] = ringPoint(t, 2.2);
    add(cx, groundY(cx, cz) + 0.5, cz, flood, 0.8);
  }
  // Each lamp stays at street level even where the ground dips (the moat).
  for (let i = 1; i < pos.length; i += 3) pos[i] = Math.max(pos[i], groundY(pos[i - 1], pos[i + 1]) + 0.4);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const lights = new THREE.Points(
    lg,
    new THREE.PointsMaterial({ size: 4.6, map: sprite, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  lights.visible = false;
  lights.frustumCulled = false;
  group.add(lights);

  return { group, lights };
}
