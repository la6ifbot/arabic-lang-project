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

/** Two fingers on the card, spreading or closing through each width in `widths`, then lifting. */
async function pinch(page: Page, cx: number, cy: number, ...widths: number[]) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (d: number) => [
    { x: cx - d / 2, y: cy, id: 0 },
    { x: cx + d / 2, y: cy, id: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(widths[0]) });
  for (let w = 1; w < widths.length; w++) {
    for (let i = 1; i <= 5; i++) {
      const d = widths[w - 1] + ((widths[w] - widths[w - 1]) * i) / 5;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) });
      await page.waitForTimeout(16);
    }
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** One finger dragging straight from (x, fromY) to (x, toY), with a little sideways wobble. */
async function verticalDrag(page: Page, x: number, fromY: number, toY: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: fromY }] });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 6, y: fromY + ((toY - fromY) * i) / 5 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Waits until the scene has drawn its first frames (the focused card has measured its text). */
async function sceneSettled(page: Page) {
  await waitForScene(page);
  await expect(page.locator('.boot')).toHaveAttribute('data-gone', 'true');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-max-zoom');
}

// An enlarged card fills the screen, which CI's software WebGL renders slowly at the phone's full
// pixel density (starving the tests running alongside); the gestures don't depend on it.
test.describe('pinch zoom', () => {
  test.use({ deviceScaleFactor: 1 });

  test('a pinch enlarges the card only as far as its text fits, and pinching back shrinks it', async ({ page }) => {
    test.slow();
    // A word whose example sentence is wide, so on a phone the zoom stops before the 1.8× maximum.
    await page.goto('/word/najm');
    await sceneSettled(page);
    const { width, height } = page.viewportSize()!;
    const scene = page.getByTestId('scene');
    const fit = Number(await scene.getAttribute('data-max-zoom'));
    expect(fit).toBeGreaterThan(1.2);
    expect(fit).toBeLessThan(1.8);

    // A small spread zooms a little, below the limit.
    await pinch(page, width / 2, height / 2, 100, 110);
    const small = Number(await scene.getAttribute('data-zoom'));
    expect(small).toBeGreaterThan(1.05);
    expect(small).toBeLessThan(fit);
    // Spreading far stops exactly at the limit, and stays there after the fingers lift.
    await pinch(page, width / 2, height / 2, 80, 320);
    await expect(scene).toHaveAttribute('data-zoom', fit.toFixed(2));
    await page.waitForTimeout(300);
    await expect(scene).toHaveAttribute('data-zoom', fit.toFixed(2));
    // Within one gesture, past the limit and partway back: the card shrinks straight away.
    await pinch(page, width / 2, height / 2, 100, 320, 250);
    expect(Number(await scene.getAttribute('data-zoom'))).toBeLessThan(fit - 0.1);
    // The page itself never zoomed, and nothing swiped.
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
    await expect(page.getByTestId('focused-word')).toHaveAttribute('data-slug', 'najm');

    await pinch(page, width / 2, height / 2, 320, 40);
    await expect(scene).not.toHaveAttribute('data-zoom');
    // A swipe still works afterwards.
    await touchSwipe(page, width * 0.25, width * 0.9, height / 2);
    await expect(focused(page)).not.toHaveAttribute('data-slug', 'najm');
  });

  test.describe('on a wider screen', () => {
    // Landscape tablet: the card is height-limited, so it reaches 1.8× and outgrows the screen.
    test.use({ viewport: { width: 1024, height: 768 } });

    test('up/down drags on an enlarged card show its top and bottom, never a swipe', async ({ page }) => {
      test.slow();
      await page.goto('/word/najm');
      await sceneSettled(page);
      const { width, height } = page.viewportSize()!;
      const scene = page.getByTestId('scene');
      await pinch(page, width / 2, height / 2, 80, 320);
      await expect(scene).toHaveAttribute('data-zoom', '1.80');
      await verticalDrag(page, width / 2, height * 0.3, height * 0.8);
      await expect.poll(async () => Number(await scene.getAttribute('data-pan'))).toBeGreaterThan(60);
      await verticalDrag(page, width / 2, height * 0.8, height * 0.1);
      await expect.poll(async () => Number(await scene.getAttribute('data-pan'))).toBeLessThan(-60);
      await expect(page.getByTestId('focused-word')).toHaveAttribute('data-slug', 'najm');
      await expect(scene).toHaveAttribute('data-zoom', '1.80');
    });
  });
});

test('on a phone, swiping stays silent and the speaker button starts the music', async ({ page }) => {
  await page.goto('/');
  await waitForScene(page);
  const { width, height } = page.viewportSize()!;
  await touchSwipe(page, width * 0.25, width * 0.9, height / 2);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('music-toggle').tap();
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'true');
});
