import * as THREE from 'three';
import { CARD_ASPECT } from '../lib/cardTexture';
import { NOISE_GLSL, WATER_GLSL } from './glsl';
import { sharedUniforms } from './uniforms';

export type CardMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uMap: { value: THREE.Texture };
    uFocus: { value: number };
    uOpacity: { value: number };
    uSeed: { value: number };
    uHover: { value: number };
    uPulse: { value: number };
    uGlow: { value: number };
    uBend: { value: number };
  };
};

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uBend;
  uniform float uFocus;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  varying float vDist;

  void main() {
    vUv = uv;
    vec3 p = position;
    // A slight curvature, like a sliver of shell, gives the edge something to catch light on.
    p.z -= uBend * p.x * p.x;
    // Slow undulation from the current; calmer on the focused card so the text stays still.
    p.z += sin(p.y * 1.2 + uTime * 0.7 + uSeed * 6.2831) * 0.02 * (1.0 - uFocus * 0.8);
    vec3 n = normalize(vec3(2.0 * uBend * p.x, 0.0, 1.0));
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * n);
    vViewDirW = normalize(cameraPosition - wp.xyz);
    vec4 mv = viewMatrix * wp;
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  ${WATER_GLSL}
  ${NOISE_GLSL}
  uniform sampler2D uMap;
  uniform float uFocus, uOpacity, uSeed, uHover, uPulse, uGlow;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  varying float vDist;

  const float ASPECT = ${CARD_ASPECT.toFixed(4)};

  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(ASPECT, 1.0);
    float d = sdRoundRect(p, vec2(ASPECT * 0.5, 0.5), 0.045);
    float aa = fwidth(d) * 1.25;
    float shape = 1.0 - smoothstep(-aa, aa, d);
    if (shape <= 0.001) discard;

    float unf = 1.0 - uFocus;
    float t = uTime;

    // Caustic refraction: the water between us and an unfocused card bends its surface.
    vec2 cp = vUv * vec2(ASPECT, 1.0) * 3.5 + uSeed * 17.0;
    vec2 warp = vec2(vnoise(cp + t * 0.35), vnoise(cp.yx * 1.3 - t * 0.3)) - 0.5;
    vec2 uv = vUv + warp * 0.014 * (0.08 + unf);
    // Depth of field: sample blurrier mip levels the further a card is from focus.
    vec4 tex = texture2D(uMap, uv, unf * 3.0);

    vec3 V = normalize(vViewDirW);
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // Pearl body: dark, cool, lit from above.
    vec3 body = mix(vec3(0.028, 0.068, 0.095), vec3(0.085, 0.19, 0.225), smoothstep(-0.15, 1.15, vUv.y));
    // Milky nacre sheen that slides as the viewing angle changes.
    vec2 sc = vec2(0.32 + V.x * 0.9, 0.8 + V.y * 0.6);
    vec2 sd = (vUv - sc) * vec2(1.3, 1.0);
    body += vec3(0.22, 0.3, 0.33) * exp(-dot(sd, sd) * 3.5) * 0.32;
    // Caustic light playing across the surface.
    float c = caustic(cp * 0.6, t * 0.55);
    body += vec3(0.3, 0.72, 0.72) * c * (0.035 + 0.22 * unf);

    // Mother-of-pearl rim: hue shifts with angle, position and time.
    float band = 1.0 - smoothstep(0.0, 0.006 + aa, abs(d + 0.006));
    float hue = ndv * 1.6 + (vUv.x - vUv.y) * 0.9 + t * 0.03 + uSeed * 3.0;
    vec3 irid = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
    // Nacre, not neon: mostly pearl-white with a soft drift of rose, mint and gold.
    irid = mix(vec3(0.86, 0.9, 0.9), irid, 0.2) * mix(0.55, 1.0, uFocus);
    float inner = 1.0 - smoothstep(0.0, 0.07, -d);
    vec3 col = body + irid * inner * 0.07;

    // Text (premultiplied alpha, so blurred mips stay luminous instead of turning grey).
    float ink = 0.5 + 0.5 * uFocus;
    col = col * (1.0 - tex.a * ink) + tex.rgb * ink;
    col = mix(col, irid, band * mix(0.45, 0.95, uFocus));

    col += vec3(0.35, 0.8, 0.8) * (uPulse * 0.1 + uHover * 0.07 + uGlow * 0.3) * (inner + 0.25);

    // Murk: distant/unfocused cards dissolve into the colour of the water behind them.
    float fog = 1.0 - exp(-pow(max(vDist - 9.5, 0.0) * 0.085, 1.25));
    fog = clamp(fog + unf * 0.1, 0.0, 0.94);
    col = mix(col, waterColor(gl_FragCoord.xy / uResolution), fog);

    float alpha = shape * mix(mix(0.86, 1.0, max(band, tex.a)), 1.0, uFocus) * uOpacity;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createCardMaterial(map: THREE.Texture, seed: number): CardMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedUniforms.uTime,
      uResolution: sharedUniforms.uResolution,
      uMap: { value: map },
      uFocus: { value: 0 },
      uOpacity: { value: 0 },
      uSeed: { value: seed },
      uHover: { value: 0 },
      uPulse: { value: 0 },
      uGlow: { value: 0 },
      uBend: { value: 0.035 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
  }) as CardMaterial;
}

/** Light shaft that finds a pearl in the depths before it rises. */
export function createShaftMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: sharedUniforms.uTime, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity;
      varying vec2 vUv;
      void main() {
        float x = vUv.x - 0.5;
        float width = mix(0.16, 0.42, vUv.y);
        float core = exp(-(x * x) / (width * width) * 3.0);
        float along = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float shimmer = 0.8 + 0.2 * sin(vUv.y * 30.0 - uTime * 3.0);
        float a = core * along * shimmer * uOpacity * 0.5;
        gl_FragColor = vec4(vec3(0.7, 1.0, 0.97) * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
