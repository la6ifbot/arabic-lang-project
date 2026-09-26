import * as THREE from 'three';

export type TimeId = 'fajr' | 'duha' | 'shafaq' | 'layl';

interface LookDef {
  /** Azimuth (degrees clockwise from north) and elevation of the light: the sun, or the moon at night. */
  light: [number, number];
  lightColor: string;
  lightI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  zenith: string;
  horizon: string;
  fog: number;
  exposure: number;
  glow: number; // sun glow in the sky
  disk: number; // visible sun disc
  stars: number;
  moon: number;
  flood: number; // floodlights on the citadel
  lamps: number; // city lights
  windows: number; // lit windows
}

/** Four moments, named with words from Durar: fajr, ḍuḥā, shafaq, layl. */
const LOOKS: Record<TimeId, LookDef> = {
  fajr: {
    light: [80, 7],
    lightColor: '#ffb98a',
    lightI: 2.3,
    hemiSky: '#a4b2d6',
    hemiGround: '#826b5a',
    hemiI: 0.9,
    zenith: '#5874a8',
    horizon: '#e2c1b1',
    fog: 0.0003,
    exposure: 1.0,
    glow: 1,
    disk: 1,
    stars: 0.1,
    moon: 0,
    flood: 0.12,
    lamps: 0.35,
    windows: 0.25,
  },
  duha: {
    light: [150, 52],
    lightColor: '#fff3e2',
    lightI: 3.3,
    hemiSky: '#bcd2ee',
    hemiGround: '#957f60',
    hemiI: 0.85,
    zenith: '#3a72c2',
    horizon: '#d2dfea',
    fog: 0.0002,
    exposure: 0.9,
    glow: 0.6,
    disk: 1,
    stars: 0,
    moon: 0,
    flood: 0,
    lamps: 0,
    windows: 0,
  },
  shafaq: {
    light: [250, 12],
    lightColor: '#ffb372',
    lightI: 3.1,
    hemiSky: '#8c9fd6',
    hemiGround: '#6e5a48',
    hemiI: 0.95,
    zenith: '#3b5790',
    horizon: '#e2ad8f',
    fog: 0.00024,
    exposure: 1.02,
    glow: 1.2,
    disk: 1,
    stars: 0,
    moon: 0,
    flood: 0.05,
    lamps: 0.12,
    windows: 0.2,
  },
  layl: {
    light: [215, 38],
    lightColor: '#a9b8ff',
    lightI: 0.45,
    hemiSky: '#2b3b5d',
    hemiGround: '#1b1611',
    hemiI: 0.42,
    zenith: '#050b19',
    horizon: '#1c2640',
    fog: 0.00045,
    exposure: 1.1,
    glow: 0,
    disk: 0,
    stars: 1,
    moon: 1,
    flood: 1,
    lamps: 1,
    windows: 1.4,
  },
};

const NUMS = ['lightI', 'hemiI', 'fog', 'exposure', 'glow', 'disk', 'stars', 'moon', 'flood', 'lamps', 'windows'] as const;
const COLOURS = ['lightColor', 'hemiSky', 'hemiGround', 'zenith', 'horizon'] as const;
const DEG = Math.PI / 180;

/** A resolved lighting state that can be blended with another. */
export class Look {
  az = 0;
  el = 0;
  lightI = 0;
  hemiI = 0;
  fog = 0;
  exposure = 1;
  glow = 0;
  disk = 0;
  stars = 0;
  moon = 0;
  flood = 0;
  lamps = 0;
  windows = 0;
  readonly lightColor = new THREE.Color();
  readonly hemiSky = new THREE.Color();
  readonly hemiGround = new THREE.Color();
  readonly zenith = new THREE.Color();
  readonly horizon = new THREE.Color();

  static of(id: TimeId): Look {
    const d = LOOKS[id];
    const l = new Look();
    [l.az, l.el] = d.light;
    for (const k of NUMS) l[k] = d[k];
    for (const k of COLOURS) l[k].set(d[k]);
    return l;
  }

  /** This = a → b at t. The light swings the short way round, like the sun across the south. */
  mix(a: Look, b: Look, t: number): this {
    let dAz = (((b.az - a.az) % 360) + 540) % 360 - 180;
    if (Math.abs(dAz) > 179.9) dAz = 180;
    this.az = a.az + dAz * t;
    this.el = a.el + (b.el - a.el) * t;
    for (const k of NUMS) this[k] = a[k] + (b[k] - a[k]) * t;
    for (const k of COLOURS) this[k].lerpColors(a[k], b[k], t);
    return this;
  }

  copy(o: Look): this {
    return this.mix(o, o, 0);
  }

  direction(out: THREE.Vector3): THREE.Vector3 {
    const az = this.az * DEG;
    const el = this.el * DEG;
    return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  }
}

/** Gradient sky with sun glow, stars and a crescent moon; it always sits around the camera. */
export function createSky(): { mesh: THREE.Mesh; apply(look: Look, dir: THREE.Vector3): void } {
  const uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlow: { value: 0 },
    uDisk: { value: 0 },
    uStars: { value: 0 },
    uMoon: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uDir;
      uniform float uGlow;
      uniform float uDisk;
      uniform float uStars;
      uniform float uMoon;
      varying vec3 vDir;
      float sHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
        col = mix(col, uHorizon, exp(-max(h, 0.0) * 30.0) * 0.55);
        if (h < 0.0) col = uHorizon;
        float s = max(dot(d, uDir), 0.0);
        col += uSunColor * uGlow * (0.16 * pow(s, 6.0) + 0.5 * pow(s, 64.0));
        col += uSunColor * uDisk * 14.0 * smoothstep(0.99955, 0.99972, s) * step(-0.005, h);
        if (uStars > 0.001) {
          vec3 p = d * 300.0;
          vec3 cell = floor(p);
          float r = sHash(cell);
          if (r > 0.9965) {
            vec3 c = cell + 0.5 + 0.3 * (vec3(sHash(cell + 1.3), sHash(cell + 2.7), sHash(cell + 4.1)) - 0.5);
            float star = smoothstep(0.36, 0.0, length(p - c)) * (0.35 + 0.65 * fract(r * 713.0));
            col += vec3(1.0, 0.96, 0.9) * star * uStars * 2.4 * smoothstep(0.02, 0.2, h);
          }
        }
        if (uMoon > 0.001) {
          float m = dot(d, uDir);
          vec3 side = normalize(cross(uDir, vec3(0.0, 1.0, 0.0)));
          vec3 bite = normalize(uDir + side * 0.013 + vec3(0.0, 0.006, 0.0));
          float disc = smoothstep(0.99972, 0.99978, m);
          float shade = smoothstep(0.9997, 0.99977, dot(d, bite));
          col += vec3(1.0, 0.92, 0.74) * clamp(disc - shade, 0.0, 1.0) * 5.0 * uMoon;
          col += vec3(0.55, 0.6, 0.78) * pow(max(m, 0.0), 180.0) * 0.18 * uMoon;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.scale.setScalar(8500);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (_r, _s, camera) => {
    mesh.position.copy(camera.position);
    mesh.updateMatrixWorld();
  };
  return {
    mesh,
    apply(look, dir) {
      uniforms.uZenith.value.copy(look.zenith);
      uniforms.uHorizon.value.copy(look.horizon);
      uniforms.uSunColor.value.copy(look.lightColor);
      uniforms.uDir.value.copy(dir);
      uniforms.uGlow.value = look.glow;
      uniforms.uDisk.value = look.disk;
      uniforms.uStars.value = look.stars;
      uniforms.uMoon.value = look.moon;
    },
  };
}
