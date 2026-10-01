import * as THREE from 'three';
import { CARD_ASPECT } from '../lib/cardTexture';
import { UNSEEN_DEPTH } from '../progress/queue';
import { ZOOM_FIT } from '../lib/zoom';

export const CARD_H = 3;
export const CARD_W = CARD_H * CARD_ASPECT;
export const CAMERA_Z = 9;
export const CAMERA_FOV = 38;

const GOLDEN = 2.399963;

export interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  s: number;
}

export class Layout {
  aspect = 1;
  tanHalf = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));

  update(width: number, height: number) {
    this.aspect = width / Math.max(height, 1);
  }

  halfH(z: number) {
    return this.tanHalf * (CAMERA_Z - z);
  }

  halfW(z: number) {
    return this.halfH(z) * this.aspect;
  }

  get portrait() {
    return this.aspect < 0.9;
  }

  /** Scale that makes the focused card fill most of the viewport without touching the chrome. */
  focusScale() {
    const hh = this.halfH(0);
    const hw = this.halfW(0);
    return Math.min((hh * 2 * (this.portrait ? 0.68 : 0.74)) / CARD_H, (hw * 2 * 0.86) / CARD_W);
  }

  /**
   * Largest pinch zoom at which the focused card's widest line of text (`textWidth`, a fraction of
   * the card width) still fits across the screen, never below 1 or above `max`.
   */
  fitZoom(textWidth: number, max: number) {
    const onScreen = (CARD_W * this.focusScale() * textWidth) / (this.halfW(0) * 2);
    return Math.min(max, Math.max(1, ZOOM_FIT / Math.max(onScreen, 0.01)));
  }

  focus(): Pose {
    return { x: 0, y: this.portrait ? -this.halfH(0) * 0.02 : -this.halfH(0) * 0.01, z: 0, rx: 0, ry: 0, rz: 0, s: this.focusScale() };
  }

  /**
   * Background resting place for the card `index` places behind the focus (index ≥ 1), at a depth
   * (0 = near the light, 1 = the deep; unseen words float mid-water).
   */
  slot(index: number, depth = UNSEEN_DEPTH): Pose {
    const d = depth - UNSEEN_DEPTH;
    const z = -2.4 - index * 2.15 - d * 7;
    const hh = this.halfH(z);
    const hw = this.halfW(z);
    const a = index * GOLDEN + 0.9;
    const r = 0.5 + 0.4 * ((index * 0.618) % 1);
    const spreadX = this.portrait ? 0.55 : 0.8;
    const x = Math.cos(a) * r * hw * spreadX;
    const y = Math.sin(a) * r * hh * 0.62 + hh * 0.04 - d * hh * 0.5;
    return { x, y, z, rx: 0.05, ry: -x * 0.025, rz: (((index * 0.37) % 1) - 0.5) * 0.24, s: 1 };
  }

  /**
   * Where a “still learning” card lingers: beside the new focus, near the light and still sharp,
   * so it can be read once or twice more before it softens back into the field.
   */
  aside(): Pose {
    const z = this.portrait ? -2.4 : -0.8;
    const hw = this.halfW(z);
    const s = this.focusScale() * (this.portrait ? 0.8 : 0.72);
    const half = (CARD_W * s) / 2;
    const x = this.portrait ? -hw * 0.62 : -(hw - half - hw * 0.05);
    return { x, y: this.focus().y + 0.05, z, rx: 0, ry: 0.26, rz: 0.03, s };
  }

  /** Where a “known” card sinks to: down, away and into the dark, deeper for higher boxes. */
  sunk(fromX: number, depth = 0.5): Pose {
    const z = -6 - depth * 8;
    return { x: fromX * 0.3 + this.halfW(z) * 0.45, y: -this.halfH(z) * (1.05 + depth * 0.6), z, rx: 0.55, ry: -0.2, rz: -0.35, s: 1 };
  }

  /** Known words that aren't due: out of the rotation, drifting low in the background at their depth. */
  drift(slot: number, depth: number): Pose {
    const z = -9 - depth * 9 - (slot % 3) * 1.2;
    const hh = this.halfH(z);
    const hw = this.halfW(z);
    const a = slot * GOLDEN + 2.1;
    const x = Math.cos(a) * hw * (this.portrait ? 0.55 : 0.75);
    const y = -hh * (0.15 + depth * 0.45) + Math.sin(a) * hh * 0.15;
    return { x, y, z, rx: 0.12, ry: -x * 0.02, rz: (((slot * 0.53) % 1) - 0.5) * 0.3, s: 1 };
  }

  /** Where a searched-for card waits before it rises. */
  abyss(seed: number): Pose {
    const z = -15;
    return { x: (seed - 0.5) * this.halfW(z) * 0.8, y: -this.halfH(z) * 1.05, z, rx: 0.35, ry: 0, rz: (seed - 0.5) * 0.4, s: 1 };
  }
}

/** Critically-damped spring (a.k.a. SmoothDamp): eases in *and* out, and retargets smoothly. */
export function smoothDamp(cur: number, target: number, vel: { v: number }, smoothTime: number, dt: number) {
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * exp;
  return target + (change + temp) * exp;
}

export function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}
