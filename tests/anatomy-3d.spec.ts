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
