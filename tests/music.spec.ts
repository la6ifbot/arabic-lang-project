import { expect, test } from '@playwright/test';
import { waitForScene } from './helpers';

const toggle = (page: import('@playwright/test').Page) => page.getByTestId('music-toggle');
const audioRequested = (page: import('@playwright/test').Page) =>
  page.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.includes('/audio/')));

test('music is off until the speaker button is tapped, keeps playing across pages, and remembers off', async ({ page }) => {
  await page.goto('/');
  await waitForScene(page);
  // First visit: the button invites, once; nothing plays and the file isn't even fetched.
  await expect(toggle(page)).toHaveAttribute('data-invite', 'true');
  await page.keyboard.press('ArrowRight');
  await page.mouse.click(10, 400);
  await page.waitForTimeout(500);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await audioRequested(page)).toBe(false);

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle(page)).not.toHaveAttribute('data-invite');

  // Moving to another page inside the site doesn't interrupt it.
  await page.evaluate(() => {
    history.pushState(null, '', '/privacy');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('link', { name: 'Back to the sea' })).toBeVisible();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');

  // Off is remembered, and the invitation isn't repeated.
  await page.goto('/');
  await waitForScene(page);
  await expect(toggle(page)).not.toHaveAttribute('data-invite');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
});

test('someone who turned the music on gets it back at their first interaction', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('durar:music', 'on'));
  await page.goto('/');
  await waitForScene(page);
  await expect(toggle(page)).not.toHaveAttribute('data-invite');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('ArrowRight');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
});

test('the music pauses in a background tab and comes back with the visitor', async ({ page }) => {
  await page.goto('/');
  await waitForScene(page);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await setHidden(false);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
});
