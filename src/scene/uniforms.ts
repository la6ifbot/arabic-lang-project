import * as THREE from 'three';

/** Uniform objects shared (by reference) across every scene material. */
export const sharedUniforms = {
  uTime: { value: 0 },
  uResolution: { value: new THREE.Vector2(1, 1) },
  /** How much deeper (darker) the whole sea is as known words grow; capped, see progress/queue.ts. */
  uDeep: { value: 0 },
};

/**
 * Test hook: `window.__DURAR_STILL__ = true` stops time in the scene (no sway, no caustics, no
 * marine snow), so two renders can be compared pixel for pixel.
 */
export const STILL = typeof window !== 'undefined' && (window as { __DURAR_STILL__?: boolean }).__DURAR_STILL__ === true;
