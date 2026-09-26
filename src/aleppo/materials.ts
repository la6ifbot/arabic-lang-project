import * as THREE from 'three';
import { rng } from './random';

/** Uniforms every patched material shares, driven by the time of day. */
export const shared = {
  flood: { value: 0 },
  floodColor: { value: new THREE.Color(1.0, 0.64, 0.33) },
};

interface StoneSpec {
  size: number; // canvas pixels
  metres: number; // one tile covers metres × metres
  course: [number, number]; // course heights (m)
  block: [number, number]; // block lengths (m)
  base: [number, number, number]; // sRGB
  vary: number; // brightness spread between blocks
  warm: number; // warm/cool spread between blocks
  mortar: string;
  joint: number; // joint width (m)
  stains: number;
  seed: number;
}

const canvas = (size: number) => Object.assign(document.createElement('canvas'), { width: size, height: size });
const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Coursed ashlar, drawn once on a canvas and tiled: blocks of Aleppo limestone in courses, each
 * a slightly different cream, honey or grey, with mortar joints, rain streaks and grain. The
 * second canvas is its bump map (joints sunk, faces slightly uneven). Both tile seamlessly.
 */
function ashlar(spec: StoneSpec) {
  const { size, metres } = spec;
  const px = size / metres;
  const r = rng(spec.seed);
  const map = canvas(size);
  const bump = canvas(size);
  const c = map.getContext('2d')!;
  const b = bump.getContext('2d')!;
  c.fillStyle = spec.mortar;
  c.fillRect(0, 0, size, size);
  b.fillStyle = '#1a1a1a';
  b.fillRect(0, 0, size, size);

  const wrapped = (draw: (ox: number, oy: number) => void) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) draw(ox, oy);
  };

  let y = 0;
  while (y < metres - 1e-6) {
    let h = r.range(spec.course[0], spec.course[1]);
    if (metres - (y + h) < spec.course[0] * 0.8) h = metres - y;
    let x = -r.range(0, spec.block[1]);
    const end = x + metres;
    while (x < end - 1e-6) {
      let w = r.range(spec.block[0], spec.block[1]);
      if (end - (x + w) < spec.block[0] * 0.6) w = end - x;
      const j = (spec.joint * px) / 2;
      const X = x * px + j;
      const Y = y * px + j;
      const W = w * px - 2 * j;
      const H = h * px - 2 * j;
      const k = 1 + spec.vary * (r.next() * 2 - 1);
      const t = spec.warm * (r.next() * 2 - 1);
      const [br, bg, bb] = spec.base;
      const col = `rgb(${clamp255(br * k * (1 + t))},${clamp255(bg * k * (1 + t * 0.35))},${clamp255(bb * k * (1 - t * 0.7))})`;
      const lift = Math.round(150 + r.next() * 80);
      const tilt = r.next() * 0.5 - 0.25;
      wrapped((ox, oy) => {
        c.fillStyle = col;
        c.fillRect(X + ox, Y + oy, W, H);
        // Faces lean a little: light at the top, a hint of shade under the bed joint.
        c.fillStyle = `rgba(255,248,232,${0.05 + tilt * 0.1})`;
        c.fillRect(X + ox, Y + oy, W, H * 0.3);
        c.fillStyle = 'rgba(60,40,20,0.08)';
        c.fillRect(X + ox, Y + oy + H * 0.82, W, H * 0.18);
        b.fillStyle = `rgb(${lift},${lift},${lift})`;
        b.fillRect(X + ox, Y + oy, W, H);
        b.fillStyle = `rgba(0,0,0,0.25)`;
        b.fillRect(X + ox, Y + oy + H * 0.85, W, H * 0.15);
      });
      x += w;
    }
    y += h;
  }

  // Weathering: pitting, then rain streaks running down from the joints.
  for (let i = 0; i < size * 1.2; i++) {
    const x = r.next() * size;
    const yy = r.next() * size;
    const rad = 0.6 + r.next() * 2.4;
    const a = 0.05 + r.next() * 0.12;
    wrapped((ox, oy) => {
      c.fillStyle = `rgba(70,55,40,${a})`;
      c.beginPath();
      c.arc(x + ox, yy + oy, rad, 0, Math.PI * 2);
      c.fill();
    });
  }
  for (let i = 0; i < spec.stains; i++) {
    const x = r.next() * size;
    const yy = r.next() * size;
    const w = 6 + r.next() * 36;
    const h = size * (0.08 + r.next() * 0.35);
    const a = 0.05 + r.next() * 0.1;
    const dark = r.chance(0.7);
    wrapped((ox, oy) => {
      const g = c.createLinearGradient(0, yy + oy, 0, yy + oy + h);
      g.addColorStop(0, dark ? `rgba(58,48,38,${a})` : `rgba(255,250,238,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x + ox, yy + oy, w, h);
    });
  }

  // Grain.
  const img = c.getImageData(0, 0, size, size);
  const bi = b.getImageData(0, 0, size, size);
  const d = img.data;
  const bd = bi.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r.next() - 0.5) * 16;
    d[i] = clamp255(d[i] + n);
    d[i + 1] = clamp255(d[i + 1] + n);
    d[i + 2] = clamp255(d[i + 2] + n * 0.9);
    const m = (r.next() - 0.5) * 40;
    bd[i] = bd[i + 1] = bd[i + 2] = clamp255(bd[i] + m);
  }
  c.putImageData(img, 0, 0);
  b.putImageData(bi, 0, 0);
  return { map, bump };
}

function tiled(cv: HTMLCanvasElement, metres: number, color: boolean, anisotropy: number) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / metres, 1 / metres); // geometry UVs are in metres
  t.anisotropy = anisotropy;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const NOISE = /* glsl */ `
  float cHash(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
  float cNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), u.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float cFbm(vec2 p) {
    float s = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * cNoise(p); p = p * 2.07 + 13.7; a *= 0.5; }
    return s / 0.9375;
  }
`;

type Kind = 'stone' | 'glacis' | 'ground' | 'house';

/**
 * Adds three things to a standard material: world position for procedural variation, eroded
 * patches of earth and dry grass on the glacis, and the warm floodlighting of the citadel at night.
 */
function patch(mat: THREE.MeshStandardMaterial, kind: Kind) {
  const flood = kind === 'stone' || kind === 'glacis';
  // Standard materials carry defines at runtime (STANDARD); the typings just don't declare them.
  const m = mat as THREE.MeshStandardMaterial & { defines?: Record<string, string> };
  m.defines = { ...m.defines, [`C_${kind.toUpperCase()}`]: '', ...(flood ? { C_FLOOD: '' } : {}) };
  mat.customProgramCacheKey = () => `citadel-${kind}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFlood = shared.flood;
    shader.uniforms.uFloodColor = shared.floodColor;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNormal;
        #ifdef C_FLOOD
          attribute float flood;
          varying float vFlood;
        #endif`,
      )
      .replace(
        '#include <worldpos_vertex>',
        /* glsl */ `#include <worldpos_vertex>
        vec4 cW = vec4(transformed, 1.0);
        vec3 cN = objectNormal;
        #ifdef USE_INSTANCING
          cW = instanceMatrix * cW;
          cN = mat3(instanceMatrix) * cN;
        #endif
        cW = modelMatrix * cW;
        vWPos = cW.xyz;
        vWNormal = normalize(mat3(modelMatrix) * cN);
        #ifdef C_FLOOD
          vFlood = flood;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uFlood;
        uniform vec3 uFloodColor;
        varying vec3 vWPos;
        varying vec3 vWNormal;
        #ifdef C_FLOOD
          varying float vFlood;
        #endif
        ${NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          vec2 q = vWPos.xz;
          // Procedural detail fades out where it would be smaller than a pixel.
          float fine = 1.0 - smoothstep(0.25, 0.9, fwidth(q.x) + fwidth(q.y));
          #ifdef C_GLACIS
            float e = cFbm(q * 0.045) * 0.6 + cFbm(q * 0.14 + 7.3) * 0.4;
            e += 0.1 * smoothstep(8.0, 40.0, vWPos.y);     // more facing lost high up
            e += 0.09 * smoothstep(-40.0, -140.0, vWPos.z); // and on the north side
            e -= 0.1 * smoothstep(60.0, 140.0, vWPos.z);    // the gate side is best kept
            float m = smoothstep(0.61, 0.67, e);
            float g = mix(0.5, cFbm(q * 0.35 + 3.1), fine);
            vec3 earth = mix(vec3(0.27, 0.2, 0.13), vec3(0.37, 0.31, 0.18), smoothstep(0.38, 0.68, g));
            diffuseColor.rgb = mix(diffuseColor.rgb, earth, m);
            diffuseColor.rgb *= 0.92 + 0.16 * cFbm(q * 0.05 + 1.7);
          #endif
          #ifdef C_GROUND
            diffuseColor.rgb *= 0.86 + 0.28 * cFbm(q * 0.035) + 0.12 * fine * (cNoise(q * 0.8) - 0.5);
          #endif
          #ifdef C_HOUSE
            diffuseColor.rgb *= 0.9 + 0.2 * cNoise(q * 0.07);
          #endif
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        #ifdef C_FLOOD
          if (uFlood > 0.001 && vFlood > 0.5) {
            vec3 n = normalize(vWNormal);
            float side = length(n.xz);
            vec2 radial = normalize(vWPos.xz + vec2(0.001));
            float out_ = side > 0.01 ? dot(n.xz / side, radial) : 0.0;
            float f = vFlood > 1.5 ? side : smoothstep(-0.15, 0.55, out_) * (0.3 + 0.7 * side);
            #ifdef C_GLACIS
              // The slope takes a softer wash than the walls and towers above it.
              f *= 0.5 + 0.25 * (1.0 - smoothstep(-12.0, 30.0, vWPos.y));
            #else
              f *= 1.35 - 0.3 * smoothstep(30.0, 66.0, vWPos.y);
            #endif
            // Fixtures every few metres leave soft scallops of light.
            f *= 0.8 + 0.2 * cos(atan(vWPos.z, vWPos.x) * 70.0);
            totalEmissiveRadiance += diffuseColor.rgb * uFloodColor * (uFlood * f);
          }
        #endif`,
      );
  };
  return mat;
}

export interface Materials {
  stone: THREE.MeshStandardMaterial;
  glacis: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  house: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  dispose(): void;
}

export function createMaterials(anisotropy: number): Materials {
  const wall = ashlar({
    size: 1024,
    metres: 8,
    course: [0.42, 0.62],
    block: [0.6, 1.5],
    base: [218, 199, 166],
    vary: 0.07,
    warm: 0.05,
    mortar: '#a8977c',
    joint: 0.035,
    stains: 70,
    seed: 11,
  });
  const slope = ashlar({
    size: 1024,
    metres: 12,
    course: [0.46, 0.56],
    block: [0.5, 1.1],
    base: [206, 190, 160],
    vary: 0.1,
    warm: 0.06,
    mortar: '#8f806a',
    joint: 0.05,
    stains: 110,
    seed: 23,
  });
  const textures = [
    tiled(wall.map, 8, true, anisotropy),
    tiled(wall.bump, 8, false, anisotropy),
    tiled(slope.map, 12, true, anisotropy),
    tiled(slope.bump, 12, false, anisotropy),
  ];
  const [wallMap, wallBump, slopeMap, slopeBump] = textures;

  const stone = patch(
    new THREE.MeshStandardMaterial({ map: wallMap, bumpMap: wallBump, bumpScale: 1.4, roughness: 0.9, vertexColors: true }),
    'stone',
  );
  const glacis = patch(
    new THREE.MeshStandardMaterial({ map: slopeMap, bumpMap: slopeBump, bumpScale: 1.2, roughness: 0.95, vertexColors: true }),
    'glacis',
  );
  const ground = patch(new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true }), 'ground');
  const house = patch(new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true }), 'house');
  const dark = new THREE.MeshStandardMaterial({ color: '#17110c', roughness: 1 });
  const glow = new THREE.MeshStandardMaterial({ color: '#2b1e13', roughness: 0.7, emissive: '#ffb257', emissiveIntensity: 0 });
  const foliage = new THREE.MeshStandardMaterial({ roughness: 0.92, vertexColors: true, flatShading: true });

  const all = [stone, glacis, ground, house, dark, glow, foliage];
  return {
    stone,
    glacis,
    ground,
    dark,
    glow,
    house,
    foliage,
    dispose() {
      all.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}

/** Soft round sprite for lamps and window lights. */
export function lampSprite(): THREE.Texture {
  const cv = canvas(64);
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,236,200,0.85)');
  g.addColorStop(0.45, 'rgba(255,190,120,0.22)');
  g.addColorStop(1, 'rgba(255,160,80,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
