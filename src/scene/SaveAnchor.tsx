import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { headAnchor, saveAnchor } from '../state/anchors';
import { gesture } from '../state/store';
import { CARD_H, CARD_W } from './layout';
import { focusedCard } from './PearlCard';

const corner = new THREE.Vector3();
const head = new THREE.Vector3();

/**
 * Pins the Save control to the focused 3D card every frame, and fades it while the card is in
 * motion (swiping, surfacing) so it never floats detached from its pearl.
 */
export function SaveAnchor() {
  useFrame(({ camera, size }) => {
    const el = saveAnchor.el;
    if (!el) return;
    corner.set(CARD_W / 2, CARD_H / 2, 0).applyMatrix4(focusedCard.matrix).project(camera);
    // Whole pixels, written only on change: the control drifts with its pearl but doesn't shimmer.
    // Kept on screen (and below the search bar) when a pinched-up card runs past the edges.
    const x = Math.min(size.width - 4, Math.round(((corner.x + 1) / 2) * size.width));
    const y = Math.max(gesture.zoom > 1 ? 60 : 0, Math.round(((1 - corner.y) / 2) * size.height));
    const settled = focusedCard.focus > 0.6 && focusedCard.opacity > 0.6 && Math.abs(gesture.dragPx) < 12;
    const transform = `translate3d(${x}px, ${y}px, 0)`;
    if (el.style.transform !== transform) el.style.transform = transform;
    if ((el.dataset.visible === 'true') !== settled) el.dataset.visible = String(settled);

    // The headword's centre, for the anatomy layer (mirrored for tests as data-head).
    const band = focusedCard.head;
    head.set(0, CARD_H / 2 - ((band.top + band.bottom) / 2) * CARD_H, 0).applyMatrix4(focusedCard.matrix).project(camera);
    const hx = Math.round(((head.x + 1) / 2) * size.width);
    const hy = Math.round(((1 - head.y) / 2) * size.height);
    Object.assign(headAnchor, { x: hx, y: hy, visible: settled });
    const mirror = `${hx},${hy}`;
    if (el.dataset.head !== mirror) el.dataset.head = mirror;
  });
  return null;
}
