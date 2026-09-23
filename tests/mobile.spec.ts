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
