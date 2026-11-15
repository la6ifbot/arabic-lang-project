import { expect, test, type Page } from '@playwright/test';
import { waitForSea } from './accounts';

// The anatomy of a word over the 3D card (the text-only view is in tests/anatomy.spec.ts).

const layer = (page: Page) => page.getByTestId('anatomy');

test.describe('over the 3D card', () => {
  test('a tap on the headword unthreads it, also when the card is pinched up; the button and L work too', async ({ page }) => {
    await page.goto('/word/hilal');
    await waitForSea(page);
    const anchor = page.locator('.save-anchor');

    const tapHeadword = async () => {
      // Let the card finish settling, so the tap lands where the headword is now.
      await page.waitForTimeout(800);
      const [x, y] = (await anchor.getAttribute('data-head'))!.split(',').map(Number);
      await page.mouse.click(x, y);
    };

    await tapHeadword();
    await expect(layer(page)).toBeVisible();
    await expect(page.getByTestId('anatomy-count')).toHaveText('4 letters');
    await page.keyboard.press('Escape');
    await expect(layer(page)).toHaveCount(0);

    // A tap elsewhere on the focused card does nothing.
    const [x, y] = (await anchor.getAttribute('data-head'))!.split(',').map(Number);
    await page.mouse.click(x, y + 260);
    await page.waitForTimeout(300);
    await expect(layer(page)).toHaveCount(0);

    // Pinched up (trackpad pinch = Ctrl + wheel): the headword moves, and a tap on it still opens.
    await page.mouse.move(x, y + 100);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -40);
    await page.keyboard.up('Control');
    await expect(page.getByTestId('scene')).toHaveAttribute('data-zoom', /.+/);
    await page.waitForTimeout(2500);
    await expect(anchor).toHaveAttribute('data-visible', 'true');
    await tapHeadword();
    await expect(layer(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(layer(page)).toHaveCount(0);

    await anchor.getByTestId('anatomy-button').click();
    await expect(layer(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(layer(page)).toHaveCount(0);

    await page.keyboard.press('L');
    await expect(layer(page)).toBeVisible();
  });
});

// Showing that the word can be tapped (src/ui/WordTapHint.tsx): a breathing glow until the first tap,
// and a short hint the first time.
test.describe('“tap the word” glow and hint', () => {
  test.use({
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'durar-help-seen', value: '1' }] }] },
  });

  test('the hint shows once and fades, the glow breathes until the word is tapped, then both stop for good', async ({ page }) => {
    await page.goto('/word/hilal');
    await waitForSea(page);
    const tap = page.getByTestId('word-tap');
    const hint = page.getByTestId('word-tap-hint');
    await expect(tap).toHaveAttribute('data-visible', 'true');
    await expect(hint).toHaveAttribute('data-on', 'true');
    await expect(hint).toHaveText('Click the word to see its letters');
    await expect(tap).toHaveAttribute('aria-hidden', 'true');
    expect(await page.locator('.word-tap-glow').evaluate((el) => getComputedStyle(el).animationName)).toBe('word-breathe');
    // It sits over the headword.
    const [hx, hy] = (await page.locator('.save-anchor').getAttribute('data-head'))!.split(',').map(Number);
    const box = (await page.locator('.word-tap-glow').boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - hx)).toBeLessThan(30);
    expect(Math.abs(box.y + box.height / 2 - hy)).toBeLessThan(30);
    // The hint fades after a few seconds, and doesn't come back on the next visit; the glow does.
    await expect(hint).not.toHaveAttribute('data-on', /.*/, { timeout: 9000 });
    await page.reload();
    await waitForSea(page);
    await expect(tap).toHaveAttribute('data-visible', 'true');
    await page.waitForTimeout(1500);
    await expect(hint).not.toHaveAttribute('data-on', /.*/);

    // The first tap on the word: both stop, also on the next visit.
    await page.waitForTimeout(800);
    const [x, y] = (await page.locator('.save-anchor').getAttribute('data-head'))!.split(',').map(Number);
    await page.mouse.click(x, y);
    await expect(layer(page)).toBeVisible();
    await expect(tap).toHaveCount(0);
    await page.reload();
    await waitForSea(page);
    await page.waitForTimeout(1000);
    await expect(tap).toHaveCount(0);
  });

  test('waits for the walk-through on a first visit; with reduced motion, the hint but no glow', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('/');
    await waitForSea(page);
    await expect(page.getByTestId('tour')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('word-tap-hint')).not.toHaveAttribute('data-on', /.*/);
    // Skipped before its step on the word: the hint says it instead.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tour')).toHaveCount(0);
    await expect(page.getByTestId('word-tap-hint')).toHaveAttribute('data-on', 'true');
    await expect(page.locator('.word-tap-glow')).toBeHidden();
    await context.close();
  });

  test('the walk-through’s step on the word stands in for the hint; the glow stays', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour')).toHaveAttribute('data-step', 'word');
    await page.getByTestId('tour-skip').click();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('word-tap-hint')).not.toHaveAttribute('data-on', /.*/);
    await expect(page.getByTestId('word-tap')).toHaveCount(1);
    await context.close();
  });

});
