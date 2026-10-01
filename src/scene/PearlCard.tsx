import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useAccount } from '../account/store';
import { acquireCardTexture, releaseCardTexture } from './texturePool';
import { WORD_BY_SLUG } from '../lib/words';
import { depthOf } from '../progress/queue';
import { useProgress } from '../state/progress';
import { EXIT_MS, gesture, useDurar } from '../state/store';
import { emitBubbles } from './Bubbles';
import { createCardMaterial, createShaftMaterial } from './cardMaterial';
import { CARD_H, CARD_W, hashSeed, smoothDamp, type Layout, type Pose } from './layout';
import { STILL } from './uniforms';

const CARD_GEOMETRY = new THREE.PlaneGeometry(CARD_W, CARD_H, 20, 28);
const SHAFT_GEOMETRY = new THREE.PlaneGeometry(CARD_W * 1.7, 16);

/** Surfacing choreography (ms): the light finds the pearl, then it rises and breaks the surface. */
const SURFACE_HOLD = 550;
const SURFACE_END = 3600;
/** “Still learning”: readable beside the new card for a while, then back into the water. */
const LINGER_HOLD = 2200;
/** Reduced motion: a short still hold in place, then a fade. */
const STILL_HOLD = 800;

const KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 's'] as const;
const GLINT_MS = 1150;

/** Live pose of the focused card, read by the scene to pin HTML controls (e.g. Save) to it. */
export const focusedCard = { slug: '', matrix: new THREE.Matrix4(), focus: 0, opacity: 0 };

interface Sim {
  pose: Pose;
  vel: Record<(typeof KEYS)[number], { v: number }>;
  opacity: number;
  focus: number;
  hover: number;
}

interface Props {
  slug: string;
  /** Position in the rotation queue; 0 = focused, -1 = departing (sinking away), -2 = drifting. */
  index: number;
  departAt?: number;
  /** Drifting slot, for known words out of the rotation. */
  drift?: number;
  layout: Layout;
  reducedMotion: boolean;
}

export function PearlCard({ slug, index, departAt, drift, layout, reducedMotion }: Props) {
  const word = WORD_BY_SLUG.get(slug)!;
  const gl = useThree((s) => s.gl);
  const seed = useMemo(() => hashSeed(slug), [slug]);
  const texture = useMemo(() => acquireCardTexture(word, Math.min(8, gl.capabilities.getMaxAnisotropy())), [word, gl]);
  useEffect(() => () => releaseCardTexture(slug), [slug]);
  const material = useMemo(() => createCardMaterial(texture, seed), [texture, seed]);
  const shaftMaterial = useMemo(() => createShaftMaterial(), []);
  useEffect(
    () => () => {
      material.dispose();
      shaftMaterial.dispose();
    },
    [material, shaftMaterial],
  );

  const group = useRef<THREE.Group>(null);
  const shaft = useRef<THREE.Mesh>(null);
  const sim = useRef<Sim | null>(null);
  const hovered = useRef(false);
  const indexRef = useRef(index);
  indexRef.current = index;
  const driftRef = useRef(drift);
  driftRef.current = drift;

  useFrame((state, rawDt) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.25); // keeps near real-time pacing even on very slow devices
    const now = performance.now();
    const t = STILL ? 0 : state.clock.elapsedTime;
    const { surfacing, learning } = useDurar.getState();
    const idx = indexRef.current;
    const slot = driftRef.current;
    // Mastery: each word sits at the depth of its box (unseen words mid-water).
    const depth = depthOf(useProgress.getState().map[slug]?.box);
    const surf = surfacing && surfacing.slug === slug ? now - surfacing.at : -1;
    const rising = idx === 0 && surf >= 0 && surf < SURFACE_END;

    if (!sim.current) {
      const start = rising
        ? layout.abyss(seed)
        : slot !== undefined
          ? layout.drift(slot, depth)
          : idx > 0
            ? layout.slot(idx, depth)
            : layout.focus();
      const pose = { ...start };
      if (!rising && idx !== 0) pose.z -= 5; // emerge from the murk
      sim.current = {
        pose,
        vel: Object.fromEntries(KEYS.map((k) => [k, { v: 0 }])) as Sim['vel'],
        opacity: 0,
        focus: idx === 0 && !rising ? 1 : 0,
        hover: 0,
      };
    }
    const s = sim.current;

    // ---- Target pose -------------------------------------------------------------------------
    let target: Pose;
    let smooth = 1.1;
    let opacityTarget = 1;
    let focusTarget = 0;

    if (departAt !== undefined) {
      const k = (now - departAt) / EXIT_MS;
      target = layout.sunk(s.pose.x, depth);
      smooth = 1.2;
      opacityTarget = k < 0.35 ? 1 : 0;
    } else if (idx === 0) {
      target = layout.focus();
      target.s *= gesture.zoom;
      // An enlarged card can be dragged up/down, but only until its top or bottom edge is in view.
      const worldPerPx = (layout.halfH(0) * 2) / state.size.height;
      const maxPan = Math.max(0, (CARD_H * target.s) / 2 - layout.halfH(0) * 0.8) / worldPerPx;
      gesture.panPx = Math.max(-maxPan, Math.min(maxPan, gesture.panPx));
      target.y -= gesture.panPx * worldPerPx;
      focusTarget = 1;
      smooth = gesture.pinching ? 0.08 : 0.95;
      if (rising) {
        smooth = surf < SURFACE_HOLD ? 40 : 1.15;
        focusTarget = surf < SURFACE_HOLD + 900 ? 0 : 1;
      }
      if (gesture.dragging || gesture.dragPx !== 0) {
        const worldPerPx = (layout.halfW(0) * 2) / state.size.width;
        const dx = gesture.dragPx * worldPerPx;
        const n = gesture.dragPx / state.size.width;
        target = { ...target, x: dx, y: target.y - Math.abs(n) * 0.6 * (n > 0 ? 1 : -0.4), rz: -n * 0.5, ry: n * 0.9, rx: Math.abs(n) * 0.3 };
        smooth = 0.07;
      }
    } else if (slot !== undefined) {
      // Out of the rotation: sink (after a “known” swipe) or drift in, and stay low at its depth.
      target = layout.drift(slot, depth);
      smooth = 1.5;
    } else {
      target = layout.slot(idx, depth);
      const lingering = learning && learning.slug === slug ? now - learning.at : -1;
      if (lingering >= 0 && lingering < LINGER_HOLD) {
        // Never blocks: the next card is already in focus and interactive while this one lingers.
        focusTarget = 1;
        if (reducedMotion) {
          target = { ...layout.focus(), z: 0.25 };
          smooth = 0.2;
          opacityTarget = lingering < STILL_HOLD ? 1 : 0;
        } else {
          target = layout.aside();
          smooth = 1.7; // noticeably slower than a “known” sink
        }
      } else if (reducedMotion && lingering >= LINGER_HOLD && s.opacity < 0.05) {
        // Faded out in place: reappear quietly in its slot instead of drifting there.
        Object.assign(s.pose, target);
      }
    }

    // Idle underwater sway.
    const amp = reducedMotion ? 0.3 : 1;
    const calm = idx === 0 && departAt === undefined ? 0.35 : 1;
    target = {
      ...target,
      y: target.y + Math.sin(t * 0.37 + seed * 20) * 0.06 * amp * calm,
      rx: target.rx + Math.sin(t * 0.29 + seed * 11) * 0.035 * amp * calm,
      ry: target.ry + Math.sin(t * 0.23 + seed * 7) * 0.06 * amp * calm,
      rz: target.rz + Math.sin(t * 0.19 + seed * 5) * 0.02 * amp * calm,
    };

    // ---- Integrate ----------------------------------------------------------------------------
    for (const k of KEYS) s.pose[k] = smoothDamp(s.pose[k], target[k], s.vel[k], k === 's' ? smooth * 0.9 : smooth, dt);
    s.opacity += (opacityTarget - s.opacity) * (1 - Math.exp(-dt * (opacityTarget > s.opacity ? 1.6 : 2.2)));
    s.focus += (focusTarget - s.focus) * (1 - Math.exp(-dt * 2.2));
    s.hover += ((hovered.current && (idx > 0 || idx === -2) ? 1 : 0) - s.hover) * (1 - Math.exp(-dt * 6));

    g.position.set(s.pose.x, s.pose.y, s.pose.z);
    g.rotation.set(s.pose.rx, s.pose.ry, s.pose.rz);
    g.scale.setScalar(s.pose.s);

    const u = material.uniforms;
    u.uFocus.value = s.focus;
    u.uOpacity.value = s.opacity;
    u.uHover.value = s.hover;
    const sinceLearning = learning && learning.slug === slug ? (now - learning.at) / 1000 : 99;
    u.uPulse.value = sinceLearning < 8 ? (0.5 + 0.5 * Math.sin(sinceLearning * 2.4)) * (1 - sinceLearning / 8) : 0;
    u.uGlow.value = rising ? Math.max(0, Math.sin(Math.PI * THREE.MathUtils.clamp((surf - 1700) / 1700, 0, 1))) : 0;
    const glint = useAccount.getState().glint;
    const gk = glint && glint.slug === slug ? (now - glint.at) / GLINT_MS : -1;
    u.uGlint.value = gk >= 0 && gk <= 1 ? gk : -1;
    u.uStill.value = reducedMotion ? 1 : 0;

    if (idx === 0 && departAt === undefined) {
      g.updateMatrixWorld();
      focusedCard.slug = slug;
      focusedCard.matrix.copy(g.matrixWorld);
      focusedCard.focus = s.focus;
      focusedCard.opacity = s.opacity;
    }

    // Light shaft + bubble wake while surfacing.
    const sh = shaft.current;
    if (sh) {
      const a = rising ? Math.min(1, surf / 350) * (1 - THREE.MathUtils.smoothstep(surf, 1900, 3300)) : 0;
      (sh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = a;
      sh.visible = a > 0.002;
    }
    if (rising && !reducedMotion && surf > SURFACE_HOLD * 0.6 && surf < 2900) {
      const bottom = s.pose.y - (CARD_H / 2) * s.pose.s * 0.8;
      emitBubbles(s.pose.x, bottom, s.pose.z - 0.2, CARD_W * s.pose.s * 0.9, 2);
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8 || indexRef.current === 0 || indexRef.current === -1) return;
    useDurar.getState().surface(slug);
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hovered.current = true;
    if (indexRef.current > 0 || indexRef.current === -2) document.body.dataset.cursor = 'pointer';
  };
  const onOut = () => {
    hovered.current = false;
    delete document.body.dataset.cursor;
  };

  return (
    <group ref={group}>
      <mesh geometry={CARD_GEOMETRY} material={material} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut} />
      <mesh
        ref={shaft}
        geometry={SHAFT_GEOMETRY}
        material={shaftMaterial}
        position={[0, 8 - CARD_H * 0.25, -0.15]}
        visible={false}
        renderOrder={10}
        raycast={() => null}
      />
    </group>
  );
}
