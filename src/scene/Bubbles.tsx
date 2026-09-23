import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sharedUniforms } from './uniforms';

const MAX = 240;
const LIFE = 2.8;

interface Pool {
  pos: Float32Array;
  vel: Float32Array;
  age: Float32Array;
  size: Float32Array;
  next: number;
}

const pool: Pool = {
  pos: new Float32Array(MAX * 3),
  vel: new Float32Array(MAX * 3),
  age: new Float32Array(MAX).fill(LIFE),
  size: new Float32Array(MAX),
  next: 0,
};

/** Emit a few bubbles around a point (world space). */
export function emitBubbles(x: number, y: number, z: number, spread: number, n = 2) {
  for (let k = 0; k < n; k++) {
    const i = pool.next;
    pool.next = (pool.next + 1) % MAX;
    pool.pos[i * 3] = x + (Math.random() - 0.5) * spread;
    pool.pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread * 0.6;
    pool.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
    pool.vel[i * 3] = (Math.random() - 0.5) * 0.15;
    pool.vel[i * 3 + 1] = 0.5 + Math.random() * 0.9;
    pool.vel[i * 3 + 2] = (Math.random() - 0.2) * 0.2;
    pool.age[i] = 0;
    pool.size[i] = 0.4 + Math.random() * 1.1;
  }
}

/** Bubble wake left behind by a pearl rising from the depths. */
export function Bubbles() {
  const ref = useRef<THREE.Points>(null);
  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pool.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aAge', new THREE.BufferAttribute(pool.age, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(pool.size, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      uniforms: { uLife: { value: LIFE }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aAge;
        attribute float aSize;
        uniform float uLife;
        uniform float uScale;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float life = clamp(aAge / uLife, 0.0, 1.0);
          vAlpha = smoothstep(0.0, 0.08, life) * (1.0 - life);
          gl_PointSize = aSize * uScale / max(-mv.z, 0.5) * (0.7 + life * 0.6);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float rim = smoothstep(0.32, 0.47, d) * (1.0 - smoothstep(0.47, 0.5, d));
          float glint = smoothstep(0.14, 0.0, length(c - vec2(-0.14, -0.16)));
          float a = (rim * 0.8 + glint + 0.06) * vAlpha;
          gl_FragColor = vec4(vec3(0.8, 0.97, 1.0) * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry, material };
  }, []);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    let alive = false;
    for (let i = 0; i < MAX; i++) {
      if (pool.age[i] >= LIFE) continue;
      alive = true;
      pool.age[i] += d;
      pool.vel[i * 3 + 1] += d * 0.35; // buoyancy
      pool.pos[i * 3] += (pool.vel[i * 3] + Math.sin(pool.age[i] * 5 + i) * 0.12) * d;
      pool.pos[i * 3 + 1] += pool.vel[i * 3 + 1] * d;
      pool.pos[i * 3 + 2] += pool.vel[i * 3 + 2] * d;
    }
    material.uniforms.uScale.value = sharedUniforms.uResolution.value.y / 16;
    if (!ref.current) return;
    ref.current.visible = alive;
    if (alive) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aAge.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
    }
  });

  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} renderOrder={20} />;
}
