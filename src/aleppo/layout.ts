/**
 * The citadel's plan, in metres. +x is east, +z is south (the gate side), y is up, and the city
 * streets are at y = 0. Sizes follow published measurements where they exist: the mound is an
 * ellipse about 285 × 160 m on top, some 50 m above the city, ringed by a moat.
 */

export const CREST_Y = 40; // the plateau edge, where the walls stand
export const MOAT_Y = -12; // moat floor
export const CREST_A = 142.5; // plateau semi-axes (285 × 160 m)
export const CREST_B = 80;
export const RUN = 70; // glacis: horizontal run from the crest down to the moat floor
export const MOAT_W = 20; // flat moat floor, glacis toe to counterscarp
export const WALL_IN = 3; // curtain wall thickness
export const WALL_TOP = 51;

/** A slightly irregular ellipse: real mounds are not drawn with a compass. */
export function wobble(t: number): number {
  return 1 + 0.018 * Math.sin(3 * t + 0.7) + 0.011 * Math.sin(5 * t + 2.1) + 0.006 * Math.sin(9 * t + 0.3);
}

export function crestPoint(t: number): [number, number] {
  const w = wobble(t);
  return [CREST_A * Math.cos(t) * w, CREST_B * Math.sin(t) * w];
}

/** Outward unit normal of the crest line. */
export function outward(t: number): [number, number] {
  const nx = Math.cos(t) / CREST_A;
  const nz = Math.sin(t) / CREST_B;
  const l = Math.hypot(nx, nz);
  return [nx / l, nz / l];
}

/** A point `offset` metres out from the crest (negative: inwards). */
export function ringPoint(t: number, offset: number): [number, number] {
  const [x, z] = crestPoint(t);
  const [nx, nz] = outward(t);
  return [x + nx * offset, z + nz * offset];
}

/**
 * Glacis profile, u = 0 at the crest to 1 at the moat floor. It is concave: about 56° under the
 * walls, easing to 27° at the toe.
 */
export const glacisOffset = (u: number) => RUN * (0.5 * u + 0.5 * u * u);
export const glacisY = (u: number) => CREST_Y - (CREST_Y - MOAT_Y) * u;
export const uFromOffset = (o: number) => (-1 + Math.sqrt(1 + (8 * o) / RUN)) / 2;

/** Elliptic angle of a plan position (ignores the wobble, which is small). */
export const tOf = (x: number, z: number) => Math.atan2(z / CREST_B, x / CREST_A);

/** Signed distance out from the crest along its normal, approximately. */
export function crestOffset(x: number, z: number): number {
  const t = tOf(x, z);
  const [cx, cz] = crestPoint(t);
  const [nx, nz] = outward(t);
  return (x - cx) * nx + (z - cz) * nz;
}

/** Gentle dome of the plateau: highest in the middle, like the real one. */
export function plateauY(x: number, z: number): number {
  const r2 = (x / CREST_A) ** 2 + (z / CREST_B) ** 2;
  return CREST_Y + 2.5 * Math.max(0, 1 - r2);
}

/** Height of the ground (plateau, glacis, moat floor or street) at a plan position. */
export function groundY(x: number, z: number): number {
  const o = crestOffset(x, z);
  if (o <= 0) return plateauY(x, z);
  if (o <= RUN) return glacisY(uFromOffset(o));
  if (o <= RUN + MOAT_W) return MOAT_Y;
  return 0;
}

// ---------- The entrance complex, on the south side ----------

/** The bridge and gate share one north–south axis. */
export const GATE_X = -8;
/** The entrance block: it stands out over the glacis, with the Throne Hall on top. */
export const BLOCK = { x0: -22, x1: 6, z0: 68, z1: 100, y0: 4, top: 62 };
export const THRESHOLD_Y = 22;
/** The lower (advanced) tower on the city side of the moat, where the climb starts. */
export const LOWER = { x: GATE_X, z: 174, half: 7.5, top: 19 };
export const BRIDGE = { s0: LOWER.z - LOWER.half, y0: 3, halfWidth: 2.6 };
export const BRIDGE_LEN = BRIDGE.s0 - BLOCK.z1;

// ---------- On the plateau ----------

export const MOSQUE = { x: -6, z: -30, w: 30, d: 28 };
export const MINARET = { x: -6, z: -46, size: 5, height: 21 };
export const BARRACKS = { x: -72, z: -28, w: 62, d: 13, rot: 0.42 };
export const THEATRE = { x: 62, z: 6, r: 25 };
export const SHRINE = { x: 26, z: 28 };
export const PALACE = { x: -44, z: 20 };
export const HAMMAM = { x: -18, z: 44 };

/** The northern Mamluk tower, part-way down the north glacis. */
export const NORTH = { x: 10, offset: 58, half: 9, top: 24 };
/** Its crest angle. */
export const NORTH_T = -Math.PI / 2 + NORTH.x / CREST_A;
