import * as THREE from 'three';
import { expect, test } from 'vitest';
import { CAMERA_FOV, CAMERA_Z, CARD_W, Layout } from '../../src/scene/layout';
import { MAX_ZOOM, ZOOM_FIT } from '../../src/lib/zoom';

const layoutFor = (width: number, height: number) => {
  const l = new Layout();
  l.update(width, height);
  return l;
};

/** Share of the screen width a centred line `textWidth` of the card wide covers at `zoom`, through the real camera. */
function onScreen(width: number, height: number, textWidth: number, zoom: number) {
  const l = layoutFor(width, height);
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);
  camera.lookAt(0, 0, -6);
  camera.updateMatrixWorld();
  const { s, y } = l.focus();
  const edge = new THREE.Vector3((CARD_W * s * zoom * textWidth) / 2, y, 0).project(camera);
  return edge.x; // NDC: 1 = the screen's right edge, so this is the line's share of the full width
}

test('on a phone, a pinch stops where the widest line covers ZOOM_FIT of the screen', () => {
  const z = layoutFor(412, 915).fitZoom(0.8, MAX_ZOOM);
  expect(z).toBeGreaterThan(1.2);
  expect(z).toBeLessThan(MAX_ZOOM);
  expect(onScreen(412, 915, 0.8, z)).toBeCloseTo(ZOOM_FIT, 3);
});

test('short text and wide screens can zoom to the full maximum, and still fit', () => {
  expect(layoutFor(412, 915).fitZoom(0.3, MAX_ZOOM)).toBe(MAX_ZOOM);
  expect(onScreen(412, 915, 0.3, MAX_ZOOM)).toBeLessThan(ZOOM_FIT);
  expect(layoutFor(1440, 900).fitZoom(0.8, MAX_ZOOM)).toBe(MAX_ZOOM);
  expect(onScreen(1440, 900, 0.8, MAX_ZOOM)).toBeLessThan(ZOOM_FIT);
});

test('never below normal size, even when the text already fills the screen', () => {
  expect(onScreen(320, 900, 1.2, 1)).toBeGreaterThan(ZOOM_FIT);
  expect(layoutFor(320, 900).fitZoom(1.2, MAX_ZOOM)).toBe(1);
});
