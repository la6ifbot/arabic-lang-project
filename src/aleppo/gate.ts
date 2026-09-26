import * as THREE from 'three';
import { archOutline, archRise, facade, Frame, machicolation, merlons, slit, type Opening, type P2, type Parts } from './builder';
import { BLOCK, BRIDGE, BRIDGE_LEN, GATE_X, LOWER, MOAT_Y, THRESHOLD_Y, groundY } from './layout';

/** The entrance block: the great gate, with the Mamluk Throne Hall on its upper floor. */
function entranceBlock(p: Parts) {
  const { stone, dark, glow } = p;
  const hw = (BLOCK.x1 - BLOCK.x0) / 2;
  const hd = (BLOCK.z1 - BLOCK.z0) / 2;
  const f = new Frame((BLOCK.x0 + BLOCK.x1) / 2, (BLOCK.z0 + BLOCK.z1) / 2, 0);
  const { y0, top } = BLOCK;
  const east = f.child(0, 0, Math.PI / 2);
  const west = f.child(0, 0, -Math.PI / 2);
  const north = f.child(0, 0, Math.PI);
  stone.flood = 2;
  stone.tint.setRGB(1.04, 1.0, 0.94);

  // The mass itself; its three outer faces are façades with real openings.
  stone.box(f, -hw, hw, y0, top, -hd, hd, { grime: 0.2, skip: ['pz', 'px', 'nx'] });

  const portalW = 6.2;
  const spring = THRESHOLD_Y + 7.6;
  const hall = (xs: number[]): Opening[] => xs.map((x) => ({ outline: archOutline(x, 47.6, 1.6, 50.6), depth: 0.9, back: glow, backShade: 1 }));
  facade(stone, f, hd, -hw, hw, y0, top, [{ outline: archOutline(0, THRESHOLD_Y, portalW, spring), depth: 2.8, back: stone, backShade: 0.6 }, ...hall([-10, -5, 0, 5, 10])]);
  facade(stone, east, hw, -hd, hd, y0, top, hall([-10, -3.4, 3.4, 10]));
  facade(stone, west, hw, -hd, hd, y0, top, hall([-10, -3.4, 3.4, 10]));

  // Inside the portal: the door, and the inscription band above it.
  const back = hd - 2.8;
  dark.box(f, -1.55, 1.55, THRESHOLD_Y, THRESHOLD_Y + 5.4, back, back + 0.06, { grime: 0, skip: ['nz'] });
  stone.tint.setRGB(1.1, 1.06, 0.98);
  stone.box(f, -2.3, 2.3, THRESHOLD_Y + 6.1, THRESHOLD_Y + 7.0, back, back + 0.14, { grime: 0, skip: ['nz'] });
  stone.tint.setRGB(1.04, 1.0, 0.94);

  // Pilasters framing the portal.
  for (const x of [-(portalW / 2 + 1.1), portalW / 2 + 1.1]) stone.box(f, x - 0.6, x + 0.6, THRESHOLD_Y - 1, 44.6, hd, hd + 0.5, { grime: 0.1 });

  // The box machicolation over the portal.
  for (let i = 0; i <= 6; i++) {
    const x = -4.3 + (8.6 * i) / 6;
    stone.box(f, x - 0.28, x + 0.28, 34.8, 36.2, hd, hd + 1.8, { grime: 0, top: false });
  }
  stone.box(f, -4.6, 4.6, 36.2, 40.6, hd, hd + 1.8, { grime: 0.05, bottom: true });
  merlons(stone, f, -4.6, 4.6, hd + 1.0, hd + 1.8, 40.6, { w: 0.9, gap: 0.8, h: 1.4 });
  slit(dark, f, -2, 37.3, hd + 1.8, 1.8, 0.3);
  slit(dark, f, 2, 37.3, hd + 1.8, 1.8, 0.3);

  // Arrow slits either side of the portal.
  for (const x of [-11.6, -8.2, 8.2, 11.6]) {
    slit(dark, f, x, THRESHOLD_Y + 5, hd, 2.4, 0.4);
    slit(dark, f, x, THRESHOLD_Y + 13, hd, 2.4, 0.4);
  }

  // String courses, then machicolations and merlons all round the roof.
  for (const y of [44.6, 55]) stone.box(f, -hw - 0.3, hw + 0.3, y, y + 0.4, -hd - 0.3, hd + 0.3, { grime: 0, bottom: true });
  for (const side of [f, east, west]) {
    const half = side === f ? hw : hd;
    const face = side === f ? hd : hw;
    machicolation(stone, side, -half + 0.5, half - 0.5, face, top - 3.4, { band: 2.4 });
  }
  merlons(stone, north, -hw, hw, hd - 0.8, hd, top);
  dark.box(north, -1.4, 1.4, 44.4, 48.4, hd, hd + 0.05, { grime: 0, skip: ['nz'] });
}

/**
 * The bridge: a stepped viaduct on seven pointed arches, climbing from the lower tower across the
 * moat and up the glacis. The arches shrink as the ground rises toward the gate.
 */
function bridge(p: Parts) {
  const { stone } = p;
  const L = BRIDGE_LEN;
  const deck = (s: number) => BRIDGE.y0 + ((THRESHOLD_Y - BRIDGE.y0) * s) / L;
  const ground = (s: number) => groundY(GATE_X, BRIDGE.s0 - s);
  const spans = [8, 8, 7.6, 7, 6.4, 5.4, 4.6];
  const pier = 2;
  let s = 1;
  const arches = spans.map((w) => {
    const a = { s0: s, s1: s + w };
    s += w + pier;
    return a;
  });

  const outline: P2[] = [];
  // The deck, as steps.
  const steps = Math.round((THRESHOLD_Y - BRIDGE.y0) / 0.3);
  const rise = (THRESHOLD_Y - BRIDGE.y0) / steps;
  outline.push([0, BRIDGE.y0]);
  for (let i = 0; i < steps; i++) {
    const x = (L * (i + 1)) / steps;
    outline.push([x, BRIDGE.y0 + rise * i], [x, BRIDGE.y0 + rise * (i + 1)]);
  }
  // Back down the underside, from the gate end to the tower: piers and arches.
  outline.push([L, ground(L) - 3]);
  for (let k = arches.length - 1; k >= 0; k--) {
    const { s0, s1 } = arches[k];
    const w = s1 - s0;
    const spring = deck((s0 + s1) / 2) - 1.4 - archRise(w);
    outline.push([s1, ground(s1) - 3], [s1, spring]);
    outline.push(...archOutline((s0 + s1) / 2, spring, w, spring, 0.72, 10).slice(3));
    outline.push([s0, ground(s0) - 3]);
  }
  outline.push([0, ground(0) - 3]);

  const toWorld = (x: number) => new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x, 0, BRIDGE.s0);
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const w = BRIDGE.halfWidth * 2;
  stone.flood = 2;
  stone.tint.setRGB(1.02, 0.99, 0.94);
  stone.absorb(new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, curveSegments: 1 }), toWorld(GATE_X - BRIDGE.halfWidth));

  // Parapets along both sides.
  const parapet = new THREE.Shape(
    [
      [0, BRIDGE.y0 - 0.3],
      [L, THRESHOLD_Y - 0.3],
      [L, THRESHOLD_Y + 1.15],
      [0, BRIDGE.y0 + 1.15],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  );
  for (const x of [GATE_X - BRIDGE.halfWidth, GATE_X + BRIDGE.halfWidth - 0.45])
    stone.absorb(new THREE.ExtrudeGeometry(parapet, { depth: 0.45, bevelEnabled: false }), toWorld(x));
}

/** The lower (advanced) tower on the city side of the moat, where visitors start the climb. */
function lowerTower(p: Parts) {
  const { stone, dark } = p;
  const f = new Frame(LOWER.x, LOWER.z, 0);
  const h = LOWER.half;
  const top = LOWER.top;
  const east = f.child(0, 0, Math.PI / 2);
  const west = f.child(0, 0, -Math.PI / 2);
  const north = f.child(0, 0, Math.PI);
  stone.flood = 2;
  stone.tint.setRGB(1.03, 0.99, 0.93);
  stone.box(f, -h, h, MOAT_Y - 1, top, -h, h, { grime: 0.24, skip: ['pz', 'nz'] });
  facade(stone, f, h, -h, h, MOAT_Y - 1, top, [{ outline: archOutline(0, 0, 3.6, 4.2), depth: 1.6, back: dark, backShade: 1 }]);
  facade(stone, north, h, -h, h, MOAT_Y - 1, top, [{ outline: archOutline(0, BRIDGE.y0, 3.2, BRIDGE.y0 + 3.4), depth: 1.6, back: dark, backShade: 1 }]);

  // Box machicolation over the city gate.
  for (let i = 0; i <= 4; i++) {
    const x = -2.9 + (5.8 * i) / 4;
    stone.box(f, x - 0.26, x + 0.26, 8.8, 10, h, h + 1.5, { grime: 0, top: false });
  }
  stone.box(f, -3.2, 3.2, 10, 13.4, h, h + 1.5, { grime: 0.05, bottom: true });
  merlons(stone, f, -3.2, 3.2, h + 0.8, h + 1.5, 13.4, { w: 0.9, gap: 0.75, h: 1.3 });

  for (const side of [f, east, west]) machicolation(stone, side, -h + 0.4, h - 0.4, h, top - 2.2, { band: 2.4 });
  merlons(stone, north, -h, h, h - 0.8, h, top);
  for (const y of [6.5, 12.5]) {
    slit(dark, f, -4.6, y, h);
    slit(dark, f, 4.6, y, h);
    slit(dark, east, 0, y, h);
    slit(dark, west, 0, y, h);
  }
}

export function buildGate(p: Parts) {
  entranceBlock(p);
  bridge(p);
  lowerTower(p);
}
