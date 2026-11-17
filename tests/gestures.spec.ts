import { expect, test, type Page } from '@playwright/test';
import { focused, focusedSlug, waitForScene } from './helpers';

/**
 * Phase 0.9 gestures (docs/PHASE-0.9-CHECKLIST.md, decisions 1–8): right = next, left = previous,
 * up = “I know it”. Left and right never change progress.
 */

const guestCopy = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('durar-progress') ?? 'null'));
const ready = (page: Page) => expect(page.getByTestId('progress-note')).toHaveAttribute('data-progress', 'ready', { timeout: 20_000 });

/** A one-finger touch drag from (x0, y0) to (x1, y1). */
async function touchDrag(page: Page, x0: number, y0: number, x1: number, y1: number) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 10;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });

  test('swipe right = next, left = previous, up = “I know it”; left and right never change progress', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await ready(page);
    const { width, height } = page.viewportSize()!;
    const first = await focusedSlug(page);

    await touchDrag(page, width * 0.2, height / 2, width * 0.9, height / 2);
    await expect(focused(page)).not.toHaveAttribute('data-slug', first);
    const second = await focusedSlug(page);
    await touchDrag(page, width * 0.9, height / 2, width * 0.2, height / 2);
    await expect(focused(page)).toHaveAttribute('data-slug', first);
    await touchDrag(page, width * 0.2, height / 2, width * 0.9, height / 2);
    await expect(focused(page)).toHaveAttribute('data-slug', second);
    // Nothing recorded, nothing announced.
    expect(await guestCopy(page)).toBeNull();
    await expect(page.getByTestId('progress-status')).toHaveText('');

    await touchDrag(page, width / 2, height * 0.6, width / 2 + 10, height * 0.25);
    await expect(focused(page)).not.toHaveAttribute('data-slug', second);
    await expect(page.getByTestId('progress-status')).toHaveText('Marked known · returns in 3 days');
    expect((await guestCopy(page)).items.map((p: { slug: string; box: number }) => [p.slug, p.box])).toEqual([[second, 2]]);
  });

  test('a swipe starting on the bottom edge (the phone’s home gesture) is ignored', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const { width, height } = page.viewportSize()!;
    const first = await focusedSlug(page);
    await touchDrag(page, width / 2, height - 6, width / 2, height * 0.3);
    await page.waitForTimeout(400);
    await touchDrag(page, width * 0.1, height - 6, width * 0.9, height - 40);
    await page.waitForTimeout(400);
    await expect(focused(page)).toHaveAttribute('data-slug', first);
  });

  test('pull-to-refresh and overscroll are blocked', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const overscroll = await page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overscrollBehaviorY]);
    expect(overscroll).toEqual(['none', 'none']);
    const { width, height } = page.viewportSize()!;
    const first = await focusedSlug(page);
    // A downward pull does nothing at all.
    await touchDrag(page, width / 2, height * 0.3, width / 2, height * 0.8);
    await page.waitForTimeout(400);
    await expect(focused(page)).toHaveAttribute('data-slug', first);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  });
});

test.describe('mouse and trackpad', () => {
  test('dragging shows what will happen: Next, Previous, ↑ I know it', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const { width, height } = page.viewportSize()!;
    const label = page.getByTestId('drag-label');
    const opacity = () => label.evaluate((el) => Number(getComputedStyle(el).opacity));
    await expect.poll(opacity).toBe(0);

    await page.mouse.move(width / 2, height / 2);
    await page.mouse.down();
    await page.mouse.move(width / 2 + 60, height / 2, { steps: 6 });
    await expect(label).toHaveText('Next');
    const faint = await opacity();
    expect(faint).toBeGreaterThan(0.1);
    await page.mouse.move(width / 2 + 200, height / 2, { steps: 6 });
    await expect.poll(opacity).toBeGreaterThan(faint);
    await expect(label).toHaveAttribute('data-ready', 'true');
    // Back to the start and let go: nothing happens, and the label fades.
    const start = await focusedSlug(page);
    await page.mouse.move(width / 2, height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(opacity).toBe(0);
    await expect(focused(page)).toHaveAttribute('data-slug', start);

    await page.mouse.move(width / 2, height / 2);
    await page.mouse.down();
    await page.mouse.move(width / 2 - 60, height / 2, { steps: 6 });
    await expect(label).toHaveText('Previous');
    await page.mouse.up();

    await page.mouse.move(width / 2, height / 2);
    await page.mouse.down();
    await page.mouse.move(width / 2, height / 2 - 80, { steps: 6 });
    await expect(label).toHaveText('↑ I know it');
    await page.mouse.move(width / 2, height / 2 - 220, { steps: 6 });
    await page.mouse.up();
    await expect(focused(page)).not.toHaveAttribute('data-slug', start);
    await expect(page.getByTestId('progress-status')).toContainText('Marked known');
  });

  test('on an enlarged card an upward drag pans it, never “I know it”', async ({ page }) => {
    await page.goto('/word/bahr');
    await waitForScene(page);
    const { width, height } = page.viewportSize()!;
    const scene = page.getByTestId('scene');
    // A trackpad pinch (Ctrl + wheel) enlarges the card.
    await page.mouse.move(width / 2, height / 2);
    await page.keyboard.down('Control');
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -60);
    await page.keyboard.up('Control');
    await expect(scene).toHaveAttribute('data-zoom', /.+/);

    await page.mouse.down();
    await page.mouse.move(width / 2, height / 2 - 300, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await expect(focused(page)).toHaveAttribute('data-slug', 'bahr');
    await expect(page.getByTestId('progress-status')).toHaveText('');
  });
});

test.describe('undo', () => {
  test('“I know it” offers Undo for a few seconds; Undo brings the card back and forgets the mark', async ({ page }) => {
    await page.goto('/word/bahr');
    await waitForScene(page);
    await ready(page);
    await page.keyboard.press('ArrowUp');
    await expect(focused(page)).not.toHaveAttribute('data-slug', 'bahr');
    expect((await guestCopy(page)).items).toHaveLength(1);
    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(focused(page)).toHaveAttribute('data-slug', 'bahr');
    await expect(page.getByTestId('progress-status')).toHaveText('Undone');
    expect((await guestCopy(page)).items).toEqual([]);
    await expect(undo).toHaveCount(0);

    // Left alone, it goes away by itself.
    await page.keyboard.press('ArrowUp');
    await expect(undo).toBeVisible();
    await expect(undo).toHaveCount(0, { timeout: 8000 });
  });
});

test.describe('the first-card nudge', () => {
  // A returning visitor in every other way, but one who hasn't seen the nudge.
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:4173',
          localStorage: [
            { name: 'durar-help-seen', value: '1' },
            { name: 'durar-word-tap', value: '{"tapped":true,"hinted":true}' },
          ],
        },
      ],
    },
  });

  test('leans the first card right, with a faint “Next”, once on this device', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const label = page.getByTestId('drag-label');
    await expect(label).toHaveText('Next', { timeout: 10_000 });
    await expect(page.locator('body')).toHaveAttribute('data-nudged', 'true', { timeout: 10_000 });
    const start = await focusedSlug(page);
    // A nudge, not a swipe.
    await expect(focused(page)).toHaveAttribute('data-slug', start);
    expect(await page.evaluate(() => localStorage.getItem('durar.nudge.v1'))).toBe('1');

    await page.reload();
    await waitForScene(page);
    await page.waitForTimeout(4000);
    await expect(page.locator('body')).not.toHaveAttribute('data-nudged', 'true');
    await expect(label).toHaveText('');
  });

  test('never comes once someone has swiped', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(4000);
    await expect(page.locator('body')).not.toHaveAttribute('data-nudged', 'true');
    expect(await page.evaluate(() => localStorage.getItem('durar.nudge.v1'))).toBe('1');
  });
});
