import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'], executablePath: process.env.PW_CHROMIUM_PATH || undefined } });

test('without WebGL the quiet text-only version appears and works', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/word/sabr');
  await expect(page.getByRole('status')).toContainText(/text-only/);
  const card = page.getByTestId('html-card');
  await expect(card.locator('h2')).toHaveText('صَبْر');
  await page.keyboard.press('ArrowRight');
  await expect(card.locator('h2')).not.toHaveText('صَبْر');
  await page.getByRole('combobox').fill('moon');
  await page.keyboard.press('Enter');
  await expect(card).toContainText(/moon/);
  await expect(page.getByTestId('mode-toggle')).toHaveCount(0);
  expect(errors).toEqual([]);
});
