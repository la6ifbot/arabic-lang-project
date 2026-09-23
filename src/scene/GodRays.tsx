import { useMemo } from 'react';
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';
import { sharedUniforms } from './uniforms';

const RAYS = [
  { x: -5.5, z: -16, w: 3.2, tilt: 0.28, speed: 0.021, phase: 0.0, strength: 0.55 },
  { x: -1.5, z: -11, w: 1.6, tilt: 0.2, speed: 0.017, phase: 1.7, strength: 0.4 },
  { x: 2.5, z: -18, w: 4.2, tilt: 0.16, speed: 0.012, phase: 3.1, strength: 0.5 },
  { x: 6.5, z: -13, w: 2.0, tilt: 0.24, speed: 0.025, phase: 4.4, strength: 0.35 },
  { x: 0.5, z: -6, w: 1.2, tilt: 0.22, speed: 0.03, phase: 5.2, strength: 0.18 },
];

/** Shafts of sunlight slanting down through the water, sweeping and breathing slowly. */
export function GodRays({ reducedMotion }: { reducedMotion: boolean }) {
  const rays = useMemo(
    () =>
      RAYS.map((r) => {
        const material = new THREE.ShaderMaterial({
          uniforms: {
            uTime: sharedUniforms.uTime,
            uPhase: { value: r.phase },
            uSpeed: { value: reducedMotion ? 0 : r.speed },
            uStrength: { value: r.strength },
          },
          vertexShader: /* glsl */ `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: /* glsl */ `
            ${NOISE_GLSL}
            uniform float uTime, uPhase, uSpeed, uStrength;
            varying vec2 vUv;
            void main() {
              float t = uTime;
              // Sweep sideways across the shaft over tens of seconds.
              float sweep = sin(t * uSpeed * 6.2831 + uPhase) * 0.18;
              float x = vUv.x - 0.5 - sweep;
              float core = exp(-x * x * 26.0);
              float streaks = 0.6 + 0.4 * vnoise(vec2(vUv.x * 9.0 + t * 0.05, t * 0.08 + uPhase));
              float breath = 0.55 + 0.45 * sin(t * 0.21 + uPhase * 3.0);
              float fall = smoothstep(0.0, 0.75, vUv.y) * (1.0 - smoothstep(0.92, 1.0, vUv.y));
              float a = core * streaks * breath * fall * uStrength * 0.22;
              gl_FragColor = vec4(vec3(0.55, 0.9, 0.9) * a, a);
            }
          `,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
        return { ...r, material };
      }),
    [reducedMotion],
  );

  return (
    <group>
      {rays.map((r, i) => (
        <mesh key={i} position={[r.x, 6, r.z]} rotation={[0, 0, r.tilt]} material={r.material} renderOrder={1}>
          <planeGeometry args={[r.w, 30]} />
        </mesh>
      ))}
    </group>
  );
}
