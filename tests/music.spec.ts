import { expect, test } from '@playwright/test';
import { waitForScene } from './helpers';

test('music starts on the first key press, keeps playing across pages, and remembers off', async ({ page }) => {
  await page.goto('/');
  await waitForScene(page);
  const toggle = page.getByTestId('music-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('ArrowRight');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // Moving to another page inside the site doesn't interrupt it.
  await page.evaluate(() => {
    history.pushState(null, '', '/privacy');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('link', { name: 'Back to the sea' })).toBeVisible();
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('music-toggle').click();
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'false');

  // Off is remembered: a new visit doesn't start it, even after interacting.
  await page.goto('/');
  await waitForScene(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'false');

  // And the button turns it back on.
  await page.getByTestId('music-toggle').click();
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'true');
});

test('a first tap on the speaker button starts the music rather than stopping it', async ({ page }) => {
  await page.goto('/');
  await waitForScene(page);
  await page.getByTestId('music-toggle').click();
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'true');
});
