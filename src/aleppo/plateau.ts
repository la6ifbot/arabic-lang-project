import * as THREE from 'three';
import { archOutline, facade, Frame, merlons, rectOutline, slit, type Builder, type Opening, type Parts } from './builder';
import { BARRACKS, BLOCK, GATE_X, HAMMAM, MINARET, MOSQUE, PALACE, SHRINE, THEATRE, crestOffset, plateauY } from './layout';
import { rng } from './random';

const around = (f: Frame) => [f, f.child(0, 0, Math.PI / 2), f.child(0, 0, Math.PI), f.child(0, 0, -Math.PI / 2)];

function dome(b: Builder, x: number, y: number, z: number, r: number, drum = 0, sides = 20) {
  if (drum > 0) b.absorb(new THREE.CylinderGeometry(r * 1.04, r * 1.04, drum, sides, 1, true), new THREE.Matrix4().makeTranslation(x, y + drum / 2, z), { boxUV: true });
  b.absorb(new THREE.SphereGeometry(r, sides, Math.ceil(sides / 3), 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(x, y + drum, z), { boxUV: true });
}

/** The Great Mosque of the Citadel (1213–14) and its square minaret, 21 m tall. */
function mosque(p: Parts) {
  const { stone, dark, glow } = p;
  const base = plateauY(MOSQUE.x, MOSQUE.z) - 0.4;
  const f = new Frame(MOSQUE.x, MOSQUE.z, 0.05);
  const hw = MOSQUE.w / 2;
  const hd = MOSQUE.d / 2;
  stone.flood = 2;
  stone.tint.setRGB(1.02, 0.99, 0.93);
  // Courtyard walls.
  stone.box(f, -hw, hw, base, base + 7.5, -hd, -hd + 1.4, { grime: 0.18 });
  stone.box(f, -hw, -hw + 1.4, base, base + 7.5, -hd, hd, { grime: 0.18 });
  stone.box(f, hw - 1.4, hw, base, base + 7.5, -hd, hd, { grime: 0.18 });
  // Prayer hall along the south side (the qibla side), opening onto the court with five arches.
  const hall = { z0: hd - 10, z1: hd };
  stone.box(f, -hw, hw, base, base + 9, hall.z0, hall.z1, { grime: 0.18, skip: ['nz'] });
  facade(
    stone,
    f.child(0, 0, Math.PI),
    -hall.z0,
    -hw,
    hw,
    base,
    base + 9,
    [-10, -5, 0, 5, 10].map((x): Opening => ({ outline: archOutline(x, base, 3.2, base + 3.6), depth: 1.2, back: dark, backShade: 1 })),
  );
  stone.box(f, -hw - 0.2, hw + 0.2, base + 9, base + 9.5, hall.z0 - 0.2, hall.z1 + 0.2, { grime: 0, bottom: true });
  dome(stone, MOSQUE.x, base + 9.5, MOSQUE.z + (hall.z0 + hall.z1) / 2, 3.6, 1.2);
  // Courtyard paving.
  stone.tint.setRGB(1.1, 1.07, 1.0);
  stone.box(f, -hw + 1.4, hw - 1.4, base, base + 0.15, -hd + 1.4, hall.z0, { grime: 0, skip: ['px', 'nx', 'pz', 'nz'] });
  dark.box(f.child(0, 0, Math.PI / 2), -1.3, 1.3, base, base + 3.4, hw, hw + 0.05, { grime: 0, skip: ['nz'] });

  // The minaret.
  const m = new Frame(MINARET.x, MINARET.z, 0.05);
  const h = MINARET.size / 2;
  const b0 = plateauY(MINARET.x, MINARET.z) - 0.4;
  const top = b0 + MINARET.height;
  const s1 = b0 + MINARET.height * 0.5;
  const s2 = b0 + MINARET.height * 0.78;
  stone.tint.setRGB(1.05, 1.0, 0.92);
  stone.box(m, -h - 0.35, h + 0.35, b0, b0 + 1.4, -h - 0.35, h + 0.35);
  stone.box(m, -h, h, b0 + 1.4, s1, -h, h, { grime: 0.1 });
  stone.box(m, -h - 0.25, h + 0.25, s1, s1 + 0.45, -h - 0.25, h + 0.25, { grime: 0, bottom: true });
  stone.box(m, -h + 0.12, h - 0.12, s1 + 0.45, s2, -h + 0.12, h - 0.12, { grime: 0.05 });
  stone.box(m, -h - 0.25, h + 0.25, s2, s2 + 0.45, -h - 0.25, h + 0.25, { grime: 0, bottom: true });
  // The top gallery: two arched openings on each side, lit at night.
  for (const side of around(m)) {
    facade(stone, side, h, -h, h, s2 + 0.45, top - 0.7, [-1.05, 1.05].map((x): Opening => ({ outline: archOutline(x, s2 + 1.1, 1.1, s2 + 2.5), depth: 0.7, back: glow, backShade: 1 })));
    slit(dark, side, 0, b0 + 7, h, 1.5, 0.3);
    slit(dark, side, 0, s1 + 2.4, h - 0.12, 1.3, 0.3);
  }
  stone.box(m, -h - 0.45, h + 0.45, top - 0.7, top, -h - 0.45, h + 0.45, { grime: 0, bottom: true });
  for (const side of around(m)) merlons(stone, side, -h - 0.45, h - 0.2, h - 0.2, h + 0.45, top, { w: 0.6, gap: 0.5, h: 0.9 });
}

/** Barracks of 1834, long and plain, with two rows of windows. */
function barracks(p: Parts) {
  const { stone, glow } = p;
  const f = new Frame(BARRACKS.x, BARRACKS.z, BARRACKS.rot);
  const base = plateauY(BARRACKS.x, BARRACKS.z) - 0.6;
  const hw = BARRACKS.w / 2;
  const hd = BARRACKS.d / 2;
  const top = base + 11;
  stone.flood = 2;
  stone.tint.setRGB(0.96, 0.95, 0.91);
  stone.box(f, -hw, hw, base, top, -hd, hd, { grime: 0.2, skip: ['pz', 'nz'] });
  const windows = (): Opening[] => {
    const out: Opening[] = [];
    for (let i = 0; i < 16; i++) {
      const x = -hw + 3 + (i * (BARRACKS.w - 6)) / 15;
      out.push({ outline: rectOutline(x - 0.55, base + 2, x + 0.55, base + 3.9), depth: 0.5, back: glow, backShade: 1 });
      out.push({ outline: archOutline(x, base + 6.4, 1.1, base + 8.1, 0.5), depth: 0.5, back: glow, backShade: 1 });
    }
    return out;
  };
  facade(stone, f, hd, -hw, hw, base, top, windows());
  facade(stone, f.child(0, 0, Math.PI), hd, -hw, hw, base, top, windows());
  stone.box(f, -hw - 0.3, hw + 0.3, top - 0.5, top, -hd - 0.3, hd + 0.3, { grime: 0, bottom: true });
  stone.box(f, -hw, hw, top, top + 0.8, hd - 0.4, hd, { grime: 0 });
  stone.box(f, -hw, hw, top, top + 0.8, -hd, -hd + 0.4, { grime: 0 });
}

/** A modern open-air theatre: stepped seats around a stage. */
function theatre(p: Parts) {
  const { stone } = p;
  const base = plateauY(THEATRE.x, THEATRE.z) - 0.6;
  const tiers = 12;
  const segs = 28;
  const a0 = 0.15;
  const a1 = Math.PI - 0.15;
  stone.flood = 0;
  stone.tint.setRGB(1.08, 1.04, 0.97);
  const pt = (r: number, a: number, y: number): [number, number, number] => [THEATRE.x + r * Math.cos(a), y, THEATRE.z + r * Math.sin(a)];
  for (let i = 0; i < tiers; i++) {
    const r0 = 9 + i * 1.3;
    const r1 = r0 + 1.3;
    const y = base + 0.5 * (i + 1);
    for (let k = 0; k < segs; k++) {
      const a = a0 + ((a1 - a0) * k) / segs;
      const b = a0 + ((a1 - a0) * (k + 1)) / segs;
      const u0 = r0 * a;
      const u1 = r0 * b;
      stone.quad(pt(r0, a, y), pt(r0, b, y), pt(r1, b, y), pt(r1, a, y), [0, 1, 0], [[u0, r0], [u1, r0], [u1, r1], [u0, r1]], [0.95, 0.95, 1, 1]);
      const m = (a + b) / 2;
      stone.quad(pt(r0, a, y - 0.5 - (i === 0 ? 0.6 : 0)), pt(r0, b, y - 0.5 - (i === 0 ? 0.6 : 0)), pt(r0, b, y), pt(r0, a, y), [-Math.cos(m), 0, -Math.sin(m)], [[u0, y - 0.5], [u1, y - 0.5], [u1, y], [u0, y]], [0.72, 0.72, 0.9, 0.9]);
    }
  }
  // Outer wall behind the top row, and the stage.
  const rOut = 9 + tiers * 1.3;
  for (let k = 0; k < segs; k++) {
    const a = a0 + ((a1 - a0) * k) / segs;
    const b = a0 + ((a1 - a0) * (k + 1)) / segs;
    const m = (a + b) / 2;
    const yt = base + 0.5 * tiers + 1.2;
    stone.quad(pt(rOut, a, base - 0.5), pt(rOut, b, base - 0.5), pt(rOut, b, yt), pt(rOut, a, yt), [Math.cos(m), 0, Math.sin(m)], [[rOut * a, base], [rOut * b, base], [rOut * b, yt], [rOut * a, yt]], [0.8, 0.8, 1, 1]);
  }
  const f = new Frame(THEATRE.x, THEATRE.z, 0);
  stone.box(f, -11, 11, base - 0.5, base + 1.2, -7, 0.5, { grime: 0.1 });
}

/** Abraham's shrine (Maqam Ibrahim): a domed cube. */
function shrine(p: Parts) {
  const { stone, dark } = p;
  const base = plateauY(SHRINE.x, SHRINE.z) - 0.5;
  const f = new Frame(SHRINE.x, SHRINE.z, -0.08);
  stone.flood = 2;
  stone.tint.setRGB(1.04, 1.0, 0.94);
  stone.box(f, -6.5, 6.5, base, base + 8, -6.5, 6.5, { grime: 0.18, skip: ['pz'] });
  facade(stone, f, 6.5, -6.5, 6.5, base, base + 8, [{ outline: archOutline(0, base, 2.4, base + 3.2), depth: 1.1, back: dark, backShade: 1 }]);
  stone.box(f, -6.8, 6.8, base + 8, base + 8.5, -6.8, 6.8, { grime: 0, bottom: true });
  stone.tint.setRGB(1.0, 0.97, 0.9);
  dome(stone, SHRINE.x, base + 8.5, SHRINE.z, 4.6, 1.8, 16);
}

/** The Ayyubid palace: low ruined walls around a court, and its tall portal. */
function palace(p: Parts) {
  const { stone } = p;
  const r = rng(31);
  const base = plateauY(PALACE.x, PALACE.z) - 0.4;
  const f = new Frame(PALACE.x, PALACE.z, 0.12);
  stone.flood = 0;
  stone.tint.setRGB(0.98, 0.95, 0.9);
  const hw = 15;
  const hd = 13;
  const run = (x0: number, x1: number, z0: number, z1: number) => {
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    let s = 0;
    while (s < len) {
      const l = Math.min(len - s, r.range(2.5, 6));
      if (r.chance(0.85)) {
        const h = r.range(1.2, 4.8);
        if (alongX) stone.box(f, x0 + s, x0 + s + l, base, base + h, z0, z1, { grime: 0.25 });
        else stone.box(f, x0, x1, base, base + h, z0 + s, z0 + s + l, { grime: 0.25 });
      }
      s += l;
    }
  };
  run(-hw, hw, -hd, -hd + 1.2);
  run(-hw, hw, hd - 1.2, hd);
  run(-hw, -hw + 1.2, -hd, hd);
  run(hw - 1.2, hw, -hd, hd);
  run(-hw, 2, -1, 0.2);
  run(4, 5.2, -hd, 3);
  // The portal, on the south side.
  stone.flood = 2;
  stone.tint.setRGB(1.04, 1.0, 0.93);
  const pf = f.child(-3, hd, 0);
  stone.box(pf, -3.6, 3.6, base, base + 9.5, -1.6, 1.6, { grime: 0.2, skip: ['pz'] });
  facade(stone, pf, 1.6, -3.6, 3.6, base, base + 9.5, [{ outline: archOutline(0, base, 3.4, base + 5.6, 0.62), depth: 1.3, back: stone, backShade: 0.62 }]);
}

/** The hammam: a bath house roofed with small domes. */
function hammam(p: Parts) {
  const { stone } = p;
  const base = plateauY(HAMMAM.x, HAMMAM.z) - 0.4;
  const f = new Frame(HAMMAM.x, HAMMAM.z, 0.2);
  stone.flood = 0;
  stone.tint.setRGB(1.0, 0.97, 0.91);
  stone.box(f, -7.5, 7.5, base, base + 4.6, -5, 5, { grime: 0.2 });
  for (const [dx, dz, r] of [
    [-4.2, -2, 2.1],
    [0, -2, 2.5],
    [4.2, -2, 2.1],
    [-2.4, 2.4, 1.8],
    [2.4, 2.4, 1.8],
  ]) {
    const [x, , z] = f.p(dx, 0, dz);
    dome(stone, x, base + 4.6, z, r, 0, 12);
  }
}

/** Foundations of houses and stores that once filled the plateau. */
function ruins(p: Parts) {
  const { stone } = p;
  const r = rng(47);
  stone.flood = 0;
  const avoid = [
    [MOSQUE.x, MOSQUE.z, 26],
    [BARRACKS.x, BARRACKS.z, 36],
    [THEATRE.x, THEATRE.z, 30],
    [SHRINE.x, SHRINE.z, 12],
    [PALACE.x, PALACE.z, 22],
    [HAMMAM.x, HAMMAM.z, 11],
    [GATE_X, (BLOCK.z0 + BLOCK.z1) / 2, 24],
  ];
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < 34; tries++) {
    const x = r.range(-128, 128);
    const z = r.range(-70, 70);
    if (crestOffset(x, z) > -10) continue;
    if (Math.abs(x - GATE_X - 5 * Math.sin(z / 30)) < 7 && z > -30) continue;
    if (avoid.some(([ax, az, rad]) => Math.hypot(x - ax, z - az) < rad)) continue;
    const f = new Frame(x, z, r.range(-0.3, 0.3));
    const base = plateauY(x, z) - 0.3;
    const w = r.range(5, 11);
    const d = r.range(4, 9);
    const k = r.range(0.9, 1.02);
    stone.tint.setRGB(k, k * 0.97, k * 0.92);
    const hgt = () => r.range(0.5, 2.2);
    stone.box(f, -w / 2, w / 2, base, base + hgt(), -d / 2, -d / 2 + 0.8, { grime: 0.3 });
    stone.box(f, -w / 2, w / 2, base, base + hgt(), d / 2 - 0.8, d / 2, { grime: 0.3 });
    stone.box(f, -w / 2, -w / 2 + 0.8, base, base + hgt(), -d / 2, d / 2, { grime: 0.3 });
    if (r.chance(0.6)) stone.box(f, w / 2 - 0.8, w / 2, base, base + hgt(), -d / 2, d / 2, { grime: 0.3 });
    placed++;
  }
}

/** Buildings on the plateau. Returns spots for a few trees. */
export function buildPlateau(p: Parts): [number, number, number][] {
  mosque(p);
  barracks(p);
  theatre(p);
  shrine(p);
  palace(p);
  hammam(p);
  ruins(p);
  const r = rng(53);
  const trees: [number, number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const z = r.range(-12, 62);
    const x = GATE_X + 5 * Math.sin(z / 30) + (r.chance(0.5) ? 1 : -1) * r.range(6, 9);
    trees.push([x, plateauY(x, z) - 0.3, z]);
  }
  for (const [cx, cz, n] of [
    [SHRINE.x + 14, SHRINE.z - 6, 4],
    [THEATRE.x + 34, THEATRE.z - 6, 5],
    [PALACE.x - 22, PALACE.z - 10, 4],
  ]) {
    for (let i = 0; i < n; i++) {
      const x = cx + r.range(-7, 7);
      const z = cz + r.range(-7, 7);
      if (crestOffset(x, z) < -6) trees.push([x, plateauY(x, z) - 0.3, z]);
    }
  }
  return trees;
}
