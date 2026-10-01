import { expect, test } from 'vitest';
import { CARD_W, Layout, ZOOM_FIT } from '../../src/scene/layout';

const layoutFor = (width: number, height: number) => {
  const l = new Layout();
  l.update(width, height);
  return l;
};

// Fraction of the screen width the card's widest line takes at a given zoom.
const onScreen = (l: Layout, textWidth: number, zoom: number) =>
  (CARD_W * l.focusScale() * textWidth * zoom) / (l.halfW(0) * 2);

test('on a phone, a pinch stops where the widest line still fits the screen', () => {
  const phone = layoutFor(412, 915);
  const z = phone.fitZoom(0.8, 1.8);
  expect(z).toBeGreaterThan(1.2);
  expect(z).toBeLessThan(1.8);
  expect(onScreen(phone, 0.8, z)).toBeCloseTo(ZOOM_FIT, 5);
});

test('short text and wide screens can zoom to the full maximum', () => {
  expect(layoutFor(412, 915).fitZoom(0.3, 1.8)).toBe(1.8);
  expect(layoutFor(1440, 900).fitZoom(0.8, 1.8)).toBe(1.8);
});

test('never below normal size, even when the text already fills the screen', () => {
  const phone = layoutFor(320, 900);
  expect(onScreen(phone, 1.2, 1)).toBeGreaterThan(ZOOM_FIT);
  expect(phone.fitZoom(1.2, 1.8)).toBe(1);
});
