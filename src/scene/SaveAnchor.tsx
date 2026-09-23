import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { saveAnchor } from '../state/anchors';
import { gesture } from '../state/store';
import { CARD_H, CARD_W } from './layout';
import { focusedCard } from './PearlCard';

const corner = new THREE.Vector3();

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
    const x = Math.round(((corner.x + 1) / 2) * size.width);
    const y = Math.round(((1 - corner.y) / 2) * size.height);
    const settled = focusedCard.focus > 0.6 && focusedCard.opacity > 0.6 && Math.abs(gesture.dragPx) < 12;
    const transform = `translate3d(${x}px, ${y}px, 0)`;
    if (el.style.transform !== transform) el.style.transform = transform;
    if ((el.dataset.visible === 'true') !== settled) el.dataset.visible = String(settled);
  });
  return null;
}
