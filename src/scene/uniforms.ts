import * as THREE from 'three';

/** Uniform objects shared (by reference) across every scene material. */
export const sharedUniforms = {
  uTime: { value: 0 },
  uResolution: { value: new THREE.Vector2(1, 1) },
};
