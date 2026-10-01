import { expect, test, type Page } from '@playwright/test';
import { focused, focusedSlug, waitForScene } from './helpers';

async function touchSwipe(page: Page, fromX: number, toX: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 10;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fromX + ((toX - fromX) * i) / steps, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('touch swipe works on a phone and nothing scrolls', async ({ page }) => {
  await page.goto('/');
  await waitForScene(page);
  const { width, height } = page.viewportSize()!;
  const start = await focusedSlug(page);
  await touchSwipe(page, width * 0.25, width * 0.9, height / 2);
  await expect(focused(page)).not.toHaveAttribute('data-slug', start);
  const overflow = await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight);
  expect(overflow).toBe(0);
  await expect(page.getByTestId('btn-known')).toBeVisible();
  await expect(page.getByRole('combobox')).toBeVisible();
});

test.describe('mobile save', () => {
  test('tap the pearl to save on a phone', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __DURAR_MOCK__: boolean }).__DURAR_MOCK__ = true;
      localStorage.setItem(
        'durar-mock-db',
        JSON.stringify({
          users: [{ id: 'u', email: 'phone@example.com', password: 'x', verified: true, provider: 'email' }],
          sessionUserId: 'u',
          saved: {},
          outbox: [],
        }),
      );
    });
    await page.goto('/word/najm');
    await waitForScene(page);
    await expect(page.getByTestId('account-button')).toBeVisible();
    const btn = page.getByTestId('save-button');
    await btn.tap();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('focused-word')).toHaveAttribute('data-slug', 'najm');
  });
});

async function pinch(page: Page, cx: number, cy: number, from: number, to: number) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (d: number) => [
    { x: cx - d / 2, y: cy, id: 0 },
    { x: cx + d / 2, y: cy, id: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + ((to - from) * i) / 10) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('pinch out enlarges the card, pinch in shrinks it back, and it never swipes', async ({ page }) => {
  await page.goto('/');
  await waitForScene(page);
  const { width, height } = page.viewportSize()!;
  const scene = page.getByTestId('scene');
  const start = await focusedSlug(page);
  await pinch(page, width / 2, height / 2, 80, 240);
  await expect(scene).toHaveAttribute('data-zoom', '1.80');
  // Stays big after the fingers lift, and the page itself didn't zoom or swipe.
  await page.waitForTimeout(300);
  await expect(scene).toHaveAttribute('data-zoom');
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  await expect(focused(page)).toHaveAttribute('data-slug', start);
  await pinch(page, width / 2, height / 2, 240, 60);
  await expect(scene).not.toHaveAttribute('data-zoom');
  // A swipe still works afterwards.
  await touchSwipe(page, width * 0.25, width * 0.9, height / 2);
  await expect(focused(page)).not.toHaveAttribute('data-slug', start);
});
