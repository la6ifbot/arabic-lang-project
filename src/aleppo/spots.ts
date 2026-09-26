import * as THREE from 'three';
import {
  BARRACKS,
  BLOCK,
  GATE_X,
  LOWER,
  MINARET,
  MOAT_W,
  MOAT_Y,
  NORTH,
  NORTH_T,
  RUN,
  SHRINE,
  THEATRE,
  WALL_TOP,
  crestPoint,
  glacisY,
  plateauY,
  ringPoint,
  uFromOffset,
} from './layout';
import type { PlaceId } from './places';

/** Where the camera goes for each place: a target, and a direction (clockwise from north) and height angle to look from. */
export interface View {
  target: [number, number, number];
  az: number;
  el: number;
  dist: number;
}

const [northX, northZ] = ringPoint(NORTH_T, NORTH.offset);

export const VIEWS: Record<PlaceId, View> = {
  overview: { target: [0, 26, 20], az: 206, el: 17, dist: 660 },
  gate: { target: [GATE_X, 34, 108], az: 194, el: 6, dist: 175 },
  bridge: { target: [GATE_X, 10, 134], az: 254, el: 8, dist: 150 },
  lowerTower: { target: [GATE_X, 9, LOWER.z], az: 158, el: 9, dist: 100 },
  moat: { target: [112, -2, 138], az: 146, el: 20, dist: 200 },
  mound: { target: [-128, 10, 36], az: 243, el: 10, dist: 330 },
  walls: { target: [92, 46, 48], az: 136, el: 14, dist: 210 },
  minaret: { target: [MINARET.x, 52, MINARET.z], az: 206, el: 22, dist: 175 },
  barracks: { target: [BARRACKS.x, 46, BARRACKS.z], az: 284, el: 27, dist: 215 },
  theatre: { target: [THEATRE.x, 42, THEATRE.z + 6], az: 150, el: 42, dist: 150 },
  shrine: { target: [SHRINE.x, 47, SHRINE.z], az: 172, el: 25, dist: 125 },
  northTower: { target: [northX, 6, northZ], az: 14, el: 11, dist: 200 },
};

export interface Anchor {
  id: PlaceId;
  pos: THREE.Vector3;
}

/** Label positions in the scene. `wallTower` is the crest angle of the tower the walls label sits on. */
export function anchors(wallTower: number): Anchor[] {
  const [mx, mz] = ringPoint(0.92, RUN + MOAT_W / 2);
  const [gx, gz] = ringPoint(2.56, RUN * 0.42);
  const [wx, wz] = crestPoint(wallTower);
  const at = (id: PlaceId, x: number, y: number, z: number): Anchor => ({ id, pos: new THREE.Vector3(x, y, z) });
  return [
    at('gate', GATE_X, BLOCK.top + 4, BLOCK.z1 - 2),
    at('bridge', GATE_X, 17, 130),
    at('lowerTower', GATE_X, LOWER.top + 5, LOWER.z),
    at('minaret', MINARET.x, plateauY(MINARET.x, MINARET.z) + MINARET.height + 3, MINARET.z),
    at('moat', mx, MOAT_Y + 2, mz),
    at('mound', gx, glacisY(uFromOffset(RUN * 0.42)) + 3, gz),
    at('walls', wx, WALL_TOP + 9, wz),
    at('northTower', northX, NORTH.top + 5, northZ),
    at('barracks', BARRACKS.x, 56, BARRACKS.z),
    at('shrine', SHRINE.x, 59, SHRINE.z),
    at('theatre', THEATRE.x, 49, THEATRE.z + 14),
  ];
}
