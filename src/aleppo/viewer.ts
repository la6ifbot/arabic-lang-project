import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Builder, type Parts } from './builder';
import { buildMound } from './citadel';
import { buildCity } from './city';
import { buildGate } from './gate';
import { Labels } from './labels';
import { groundY } from './layout';
import { createMaterials, lampSprite, shared } from './materials';
import type { PlaceId } from './places';
import { buildPlateau } from './plateau';
import { Look, createSky, type TimeId } from './sky';
import { VIEWS, anchors } from './spots';

export type Quality = 'high' | 'low';

export interface ViewerOptions {
  stage: HTMLElement;
  labelLayer: HTMLElement;
  quality: Quality;
  reducedMotion: boolean;
  time: TimeId;
  autoOrbit: boolean;
  onPick(id: PlaceId): void;
  /** The visitor took the camera: auto-orbit has stopped. */
  onUserMove(): void;
  onFirstFrame(): void;
  onContextLost(): void;
}

export interface Viewer {
  setTime(id: TimeId): void;
  flyTo(id: PlaceId): void;
  setLabels(on: boolean): void;
  setAutoOrbit(on: boolean): void;
  /** Re-measure labels (after web fonts arrive). */
  relayout(): void;
  dispose(): void;
}

const DEG = Math.PI / 180;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function createViewer(o: ViewerOptions): Viewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The citadel doesn't move, so shadows are only redrawn when the light does.
  renderer.shadowMap.autoUpdate = false;
  const maxDpr = Math.min(window.devicePixelRatio || 1, o.quality === 'high' ? 2 : 1.75);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  const canvas = renderer.domElement;
  o.stage.append(canvas);

  // ---------- The scene ----------
  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(0xffffff, 0.0003);
  scene.fog = fog;
  const mats = createMaterials(renderer.capabilities.getMaxAnisotropy());
  const parts: Parts = { stone: new Builder(), dark: new Builder(), glow: new Builder() };
  const mound = buildMound(parts);
  buildGate(parts);
  const plateauTrees = buildPlateau(parts);
  const sprite = lampSprite();
  const city = buildCity(parts, mats, o.quality, plateauTrees, sprite);
  const add = (g: THREE.BufferGeometry, m: THREE.Material, cast: boolean, receive = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
  };
  add(parts.stone.build(), mats.stone, true);
  add(parts.dark.build(), mats.dark, false);
  add(parts.glow.build(), mats.glow, false);
  add(mound.glacis, mats.glacis, true);
  add(mound.plateau, mats.ground, false);
  add(mound.moat, mats.ground, false);
  scene.add(city.group);
  const sky = createSky();
  scene.add(sky.mesh);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  const size = o.quality === 'high' ? 4096 : 2048;
  sun.shadow.mapSize.set(size, size);
  Object.assign(sun.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, near: 100, far: 2000 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.5;
  sun.target.position.set(0, 0, 30);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(sun, sun.target, hemi);

  // ---------- Camera ----------
  const camera = new THREE.PerspectiveCamera(40, 1, 1.5, 9000);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, {
    enableDamping: true,
    dampingFactor: 0.075,
    rotateSpeed: 0.55,
    zoomSpeed: 0.9,
    panSpeed: 0.7,
    screenSpacePanning: false,
    zoomToCursor: true,
    minDistance: 30,
    maxDistance: 1500,
    minPolarAngle: 6 * DEG,
    maxPolarAngle: 88 * DEG,
    maxTargetRadius: 420,
    autoRotate: o.autoOrbit,
    autoRotateSpeed: 0.45,
  });
  controls.cursor.set(0, 20, 0);

  const labels = new Labels(o.labelLayer, anchors(mound.wallTower), mound.colliders, o.onPick);

  let width = 1;
  let height = 1;
  let needsRender = true;
  const resize = () => {
    width = Math.max(1, o.stage.clientWidth);
    height = Math.max(1, o.stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = camera.aspect < 0.85 ? 52 : 40;
    camera.updateProjectionMatrix();
    labels.measure();
    needsRender = true;
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(o.stage);

  /** Camera pose for a place, pulled back on narrow screens so the subject still fits. */
  const pose = (id: PlaceId) => {
    const v = VIEWS[id];
    const target = new THREE.Vector3(...v.target);
    const ref = 1.6 * Math.tan(20 * DEG);
    const now = camera.aspect * Math.tan((camera.fov / 2) * DEG);
    const dist = v.dist * Math.max(1, (ref / now) ** 0.5);
    const az = v.az * DEG;
    const el = v.el * DEG;
    const pos = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(target);
    return { target, pos };
  };
  const start = pose('overview');
  controls.target.copy(start.target);
  camera.position.copy(start.pos);
  controls.update();

  const keepAboveGround = () => {
    const p = camera.position;
    const floor = groundY(p.x, p.z) + 4;
    if (p.y < floor) {
      p.y = floor;
      camera.lookAt(controls.target);
    }
  };

  // ---------- Flights between places ----------
  type Flight = { t0: number; dur: number; a: THREE.Vector3; b: THREE.Vector3; ra: number; rb: number; tha: number; dth: number; pha: number; phb: number; lift: number };
  let flight: Flight | null = null;
  const sph = new THREE.Spherical();
  const flyTo = (id: PlaceId) => {
    const { target, pos } = pose(id);
    if (controls.autoRotate) {
      controls.autoRotate = false;
      o.onUserMove();
    }
    if (o.reducedMotion) {
      flight = null;
      controls.enabled = true;
      controls.target.copy(target);
      camera.position.copy(pos);
      controls.update();
      needsRender = true;
      return;
    }
    sph.setFromVector3(camera.position.clone().sub(controls.target));
    const end = new THREE.Spherical().setFromVector3(pos.clone().sub(target));
    const dth = ((((end.theta - sph.theta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const travel = controls.target.distanceTo(target) + Math.abs(dth) * 180 + Math.abs(Math.log(end.radius / sph.radius)) * 260;
    flight = {
      t0: performance.now(),
      dur: THREE.MathUtils.clamp(1000 + travel * 1.7, 1300, 3400),
      a: controls.target.clone(),
      b: target,
      ra: sph.radius,
      rb: end.radius,
      tha: sph.theta,
      dth,
      pha: sph.phi,
      phb: end.phi,
      // Long moves arc up and over the mound rather than through it.
      lift: Math.min(18 * DEG, Math.abs(dth) * 0.25 + travel * 0.0002),
    };
    controls.enabled = false;
  };
  const stepFlight = (now: number) => {
    const f = flight!;
    const t = Math.min(1, (now - f.t0) / f.dur);
    const k = easeInOut(t);
    controls.target.lerpVectors(f.a, f.b, k);
    const r = Math.exp(Math.log(f.ra) + (Math.log(f.rb) - Math.log(f.ra)) * k) * (1 + 0.35 * f.lift * Math.sin(Math.PI * k));
    sph.set(r, Math.max(4 * DEG, f.pha + (f.phb - f.pha) * k - f.lift * Math.sin(Math.PI * k)), f.tha + f.dth * k);
    camera.position.setFromSpherical(sph).add(controls.target);
    camera.lookAt(controls.target);
    if (t >= 1) {
      flight = null;
      controls.enabled = true;
      controls.update();
    }
  };
  // Grabbing the view mid-flight hands it straight back to the visitor.
  const interrupt = () => {
    if (!flight) return;
    flight = null;
    controls.enabled = true;
  };
  canvas.addEventListener('pointerdown', interrupt, { capture: true });
  canvas.addEventListener('wheel', interrupt, { capture: true, passive: true });
  controls.addEventListener('start', () => {
    if (controls.autoRotate) {
      controls.autoRotate = false;
      o.onUserMove();
    }
  });

  // Keyboard: arrows orbit and tilt, + and − zoom.
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if (e.key === 'ArrowLeft') s.theta -= 7 * DEG;
    else if (e.key === 'ArrowRight') s.theta += 7 * DEG;
    else if (e.key === 'ArrowUp') s.phi = Math.max(controls.minPolarAngle, s.phi - 4 * DEG);
    else if (e.key === 'ArrowDown') s.phi = Math.min(controls.maxPolarAngle, s.phi + 4 * DEG);
    else if (e.key === '+' || e.key === '=') s.radius = Math.max(controls.minDistance, s.radius * 0.85);
    else if (e.key === '-' || e.key === '_') s.radius = Math.min(controls.maxDistance, s.radius / 0.85);
    else return;
    e.preventDefault();
    interrupt();
    if (controls.autoRotate) {
      controls.autoRotate = false;
      o.onUserMove();
    }
    camera.position.setFromSpherical(s).add(controls.target);
    controls.update();
    keepAboveGround();
    needsRender = true;
  };
  o.stage.addEventListener('keydown', onKey);

  // ---------- Time of day ----------
  const look = Look.of(o.time);
  const from = new Look();
  let to = Look.of(o.time);
  let fade: { t0: number; dur: number } | null = null;
  const lightDir = new THREE.Vector3();
  const lamps = city.lights.material as THREE.PointsMaterial;
  const applyLook = () => {
    look.direction(lightDir);
    sun.position.copy(lightDir).multiplyScalar(900).add(sun.target.position);
    sun.color.copy(look.lightColor);
    sun.intensity = look.lightI;
    hemi.color.copy(look.hemiSky);
    hemi.groundColor.copy(look.hemiGround);
    hemi.intensity = look.hemiI;
    fog.color.copy(look.horizon);
    fog.density = look.fog;
    renderer.toneMappingExposure = look.exposure;
    sky.apply(look, lightDir);
    shared.flood.value = look.flood;
    mats.glow.emissiveIntensity = look.windows;
    lamps.opacity = look.lamps;
    city.lights.visible = look.lamps > 0.01;
    renderer.shadowMap.needsUpdate = true;
  };
  applyLook();
  const setTime = (id: TimeId) => {
    from.copy(look);
    to = Look.of(id);
    if (o.reducedMotion) {
      fade = null;
      look.copy(to);
      applyLook();
      needsRender = true;
    } else fade = { t0: performance.now(), dur: 2400 };
  };

  // ---------- Loop: renders only while something changes ----------
  const perf = { frames: 0, time: 0, strikes: 0 };
  const adapt = (dt: number) => {
    perf.frames++;
    perf.time += dt;
    if (perf.time < 2) return;
    const fps = perf.frames / perf.time;
    perf.frames = 0;
    perf.time = 0;
    if (fps < 40 && dpr > 1) {
      if (++perf.strikes >= 2) {
        dpr = Math.max(1, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);
        perf.strikes = 0;
      }
    } else perf.strikes = 0;
  };

  let running = true;
  let raf = 0;
  let last = performance.now();
  let wasMoving = false;
  let frames = 0;
  const loop = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    let moving = false;
    if (flight) {
      stepFlight(now);
      moving = true;
    } else if (controls.update(dt)) {
      keepAboveGround();
      moving = true;
    }
    if (fade) {
      const t = Math.min(1, (now - fade.t0) / fade.dur);
      look.mix(from, to, easeInOut(t));
      applyLook();
      if (t >= 1) fade = null;
      moving = true;
    }
    const settle = wasMoving && !moving;
    wasMoving = moving;
    if (!moving && !needsRender && !settle) {
      perf.frames = perf.time = 0;
      return;
    }
    needsRender = false;
    renderer.render(scene, camera);
    labels.update(camera, width, height, now, settle || frames === 0);
    if (frames++ === 0) o.onFirstFrame();
    if (moving) adapt(dt);
  };
  raf = requestAnimationFrame(loop);

  const onLost = (e: Event) => {
    e.preventDefault();
    running = false;
    o.onContextLost();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  return {
    setTime,
    flyTo,
    setLabels(on) {
      labels.enabled = on;
      needsRender = true;
    },
    setAutoOrbit(on) {
      interrupt();
      controls.autoRotate = on && !o.reducedMotion;
      needsRender = true;
    },
    relayout() {
      labels.measure();
      needsRender = true;
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      o.stage.removeEventListener('keydown', onKey);
      canvas.removeEventListener('webglcontextlost', onLost);
      controls.dispose();
      labels.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) obj.geometry.dispose();
      });
      for (const m of mound.colliders) m.geometry.dispose();
      (city.lights.material as THREE.Material).dispose();
      (sky.mesh.material as THREE.Material).dispose();
      sprite.dispose();
      mats.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
