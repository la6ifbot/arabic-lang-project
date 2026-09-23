import { useMemo } from 'react';
import * as THREE from 'three';
import { NOISE_GLSL, WATER_GLSL } from './glsl';
import { sharedUniforms } from './uniforms';

/** Full-screen water gradient drawn behind everything (clip-space triangle, never culled). */
export function Backdrop() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uResolution: sharedUniforms.uResolution, uTime: sharedUniforms.uTime },
        vertexShader: /* glsl */ `
          void main() { gl_Position = vec4(position.xy, 0.99999, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          ${WATER_GLSL}
          ${NOISE_GLSL}
          void main() {
            vec2 uv = gl_FragCoord.xy / uResolution;
            vec3 col = waterColor(uv);
            // Faint caustic shimmer high in the water column.
            float aspect = uResolution.x / uResolution.y;
            float c = caustic(vec2(uv.x * aspect, uv.y) * 3.2, uTime * 0.35);
            col += vec3(0.25, 0.6, 0.6) * c * 0.06 * smoothstep(0.45, 1.0, uv.y);
            // Dither to avoid banding in the dark gradient.
            col += (hash12(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  );

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    return g;
  }, []);

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-100} />;
}
