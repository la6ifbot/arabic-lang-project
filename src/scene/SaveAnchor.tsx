import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cardZone, headAnchor, saveAnchor } from '../state/anchors';
import { gesture } from '../state/store';
import { CARD_H, CARD_W } from './layout';
import { focusedCard } from './PearlCard';

const below = new THREE.Vector3();
const head = new THREE.Vector3();
const corner = new THREE.Vector3();
const CORNERS = [
  [-CARD_W / 2, CARD_H / 2],
  [CARD_W / 2, CARD_H / 2],
  [CARD_W / 2, -CARD_H / 2],
  [-CARD_W / 2, -CARD_H / 2],
] as const;

/**
 * Pins the focused card's button row to the middle of the card's bottom edge every frame (the row
 * hangs just below it, never over the text), and fades it while the card is in motion (swiping,
 * surfacing) so it never floats detached from its pearl. Works from the card's live pose, so it
 * stays right on tall, narrow screens, on rotation and when the browser bars come and go.
 */
export function SaveAnchor() {
  useFrame(({ camera, size }) => {
    const el = saveAnchor.el;
    if (!el) return;
    below.set(0, -CARD_H / 2, 0).applyMatrix4(focusedCard.matrix).project(camera);
    // Whole pixels, written only on change: the row drifts with its pearl but doesn't shimmer.
    // Kept on screen (above the swipe controls) when a pinched-up card runs past the edges.
    const half = cardZone.rowWidth / 2 + 6;
    const x = Math.min(size.width - half, Math.max(half, Math.round(((below.x + 1) / 2) * size.width)));
    const maxY = cardZone.ready ? cardZone.bottom : size.height - 120;
    const y = Math.min(maxY, Math.round(((1 - below.y) / 2) * size.height));
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
    // The card's box on screen (left, top, right, bottom), mirrored for the layout tests as data-card.
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [cx, cy] of CORNERS) {
      corner.set(cx, cy, 0).applyMatrix4(focusedCard.matrix).project(camera);
      xs.push(((corner.x + 1) / 2) * size.width);
      ys.push(((1 - corner.y) / 2) * size.height);
    }
    const [l, t, r, b] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const box = `${Math.round(l)},${Math.round(t)},${Math.round(r)},${Math.round(b)}`;
    if (el.dataset.card !== box) el.dataset.card = box;
    const mirror = `${hx},${hy}`;
    if (el.dataset.head !== mirror) el.dataset.head = mirror;
  });
  return null;
}
