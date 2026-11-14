import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CARD_ASPECT, drawCard } from '../lib/cardTexture';
import { rectToQuad, type Pt } from '../lib/homography';
import { cancelIdle, whenIdle } from '../lib/idle';
import { fullWord } from '../lib/wordDetails';
import { crispText } from '../state/anchors';
import { gesture } from '../state/store';
import { BEND } from './cardMaterial';
import { CARD_H, CARD_W } from './layout';
import { focusedCard } from './PearlCard';

/** The sharp copy is drawn at the screen's real density, up to this. */
const MAX_DENSITY = 3;
/** How far across the card (each side of its centre) the copy is pinned: where the text is. */
const SPAN = 0.4;

const pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const state = { slug: '', height: 0, drawing: 0, shown: 0 };

/**
 * Sharp text on high-density phones (an iPhone's 3×, a Galaxy's 3.5×) without raising the whole 3D
 * scene's resolution: the scene renders at up to 2×, so the focused card's text, and only that, is
 * drawn again into a 2D canvas at the screen's real density (up to 3×), laid exactly over the card
 * with a perspective transform, and faded in once the card has settled while the 3D card's own copy
 * of its text fades out (its `uInk`). Off where the scene already renders at the screen's density.
 */
export function CrispText() {
  const gl = useThree((s) => s.gl);

  useEffect(
    () => () => {
      const el = crispText.el;
      if (el) el.style.opacity = '0';
      focusedCard.ink = 1;
      state.slug = '';
      cancelIdle(state.drawing);
    },
    [],
  );

  useFrame(({ camera, size }, rawDt) => {
    const el = crispText.el;
    if (!el) return;
    const density = Math.min(window.devicePixelRatio || 1, MAX_DENSITY);
    const active = density > gl.getPixelRatio() + 0.05;

    // The card's text band, projected: clockwise from top-left, slightly curved like the card.
    const x = (CARD_W / 2) * SPAN * 2;
    const z = -BEND * x * x;
    pts[0].set(-x, CARD_H / 2, z);
    pts[1].set(x, CARD_H / 2, z);
    pts[2].set(x, -CARD_H / 2, z);
    pts[3].set(-x, -CARD_H / 2, z);
    const quad = pts.map((p) => {
      p.applyMatrix4(focusedCard.matrix).project(camera);
      return [((p.x + 1) / 2) * size.width, ((1 - p.y) / 2) * size.height] as Pt;
    }) as unknown as [Pt, Pt, Pt, Pt];
    const onScreenH = Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]) / Math.max(gesture.zoom, 1);

    const settled = active && focusedCard.focus > 0.95 && focusedCard.opacity > 0.95 && Math.abs(gesture.dragPx) < 2 && !gesture.pinching;
    // (Re)draw for a new card, or when the card's size on screen has changed a lot (rotation, bars).
    if (settled && !state.drawing && (state.slug !== focusedCard.slug || Math.abs(onScreenH - state.height) > state.height * 0.12)) {
      const slug = focusedCard.slug;
      const word = fullWord(slug);
      state.drawing = whenIdle(() => {
        state.drawing = 0;
        if (!word || focusedCard.slug !== slug) return;
        const h = Math.min(4096, Math.round(onScreenH * density));
        const canvas = el as HTMLCanvasElement;
        canvas.height = h;
        canvas.width = Math.round(h * CARD_ASPECT);
        canvas.style.width = `${canvas.width / density}px`;
        canvas.style.height = `${h / density}px`;
        drawCard(canvas, word);
        state.slug = slug;
        state.height = onScreenH;
      });
    }

    // Never shows one word's text over the next card, not even for a frame.
    if (state.slug !== focusedCard.slug) state.shown = 0;
    const ready = settled && state.slug === focusedCard.slug;
    const dt = Math.min(rawDt, 0.1);
    // Out quickly when the card moves (a swipe), in gently once it rests.
    state.shown += ((ready ? 1 : 0) - state.shown) * (1 - Math.exp(-dt * (ready ? 6 : 18)));
    if (state.shown < 0.01) state.shown = 0;
    if (state.shown > 0.99) state.shown = 1;
    focusedCard.ink = 1 - state.shown;

    const opacity = String(Math.round(state.shown * 100) / 100);
    if (el.style.opacity !== opacity) el.style.opacity = opacity;
    if (!state.shown || !state.height) return;
    const w = el.width / density;
    const h = el.height / density;
    const transform = rectToQuad({ x: w * (0.5 - SPAN), y: 0, w: w * SPAN * 2, h }, quad);
    if (el.style.transform !== transform) el.style.transform = transform;
  });
  return null;
}
