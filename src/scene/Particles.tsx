import { useMemo } from 'react';
import * as THREE from 'three';
import { sharedUniforms } from './uniforms';

/** Marine snow: slow, heavy particulate drifting upward on a gentle current. */
export function Particles({ count, reducedMotion }: { count: number; reducedMotion: boolean }) {
  const { geometry, material } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = -26 + Math.random() * 32;
      seed[i * 2] = Math.random();
      seed[i * 2 + 1] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: sharedUniforms.uTime,
        uResolution: sharedUniforms.uResolution,
        uSpeed: { value: reducedMotion ? 0.25 : 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec2 aSeed;
        uniform float uTime;
        uniform float uSpeed;
        uniform vec2 uResolution;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float t = uTime * uSpeed;
          p.y = mod(p.y + t * (0.05 + aSeed.x * 0.09) + 10.0, 20.0) - 10.0;
          p.x += sin(t * 0.13 + aSeed.y * 6.28) * 0.45 + t * 0.012;
          p.x = mod(p.x + 15.0, 30.0) - 15.0;
          p.z += cos(t * 0.1 + aSeed.x * 6.28) * 0.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = -mv.z;
          gl_PointSize = (0.9 + aSeed.y * 2.2) * (uResolution.y / 70.0) / max(dist, 0.5);
          // Fade out near the lens and into the far murk; twinkle slowly.
          vAlpha = smoothstep(0.8, 3.0, dist) * (1.0 - smoothstep(14.0, 32.0, dist));
          vAlpha *= 0.35 + 0.35 * sin(t * 0.5 + aSeed.x * 40.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(0.72, 0.92, 0.95), a * a * vAlpha * 0.95);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry, material };
  }, [count, reducedMotion]);

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />;
}
