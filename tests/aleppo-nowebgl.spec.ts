import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'], executablePath: process.env.PW_CHROMIUM_PATH || undefined } });

test('without WebGL the citadel is described in words', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/aleppo');
  await expect(page.locator('#fallback')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#fallback')).toContainText('here is the citadel in words');
  await expect(page.locator('#fallback h2')).toHaveCount(12);
  await expect(page.locator('#fallback')).toContainText('البُرْج المُتَقَدِّم');
  await expect(page.getByRole('group', { name: 'Time of day' })).toBeHidden();
  expect(errors).toEqual([]);
});
