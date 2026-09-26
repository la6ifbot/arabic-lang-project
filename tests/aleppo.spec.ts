import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers';

// Reduced motion: camera moves and time-of-day changes are instant, and nothing renders between
// them, which keeps software WebGL on CI fast.
test.describe('Citadel of Aleppo', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('draws the citadel, names its places and changes the time of day', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/aleppo');
    await expect(page.locator('#citadel')).toHaveAttribute('data-ready', '', { timeout: 30_000 });
    await expect(page.locator('#stage canvas')).toBeVisible();
    await expect(page).toHaveTitle(/Citadel of Aleppo/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('قَلْعَة حَلَب');

    const places = page.getByRole('navigation', { name: 'Places' }).getByRole('button');
    await expect(places).toHaveCount(12);
    await places.filter({ hasText: 'The bridge' }).click();
    await expect(places.filter({ hasText: 'The bridge' })).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#info')).toContainText('الجِسْر');
    await expect(page.locator('#info')).toContainText('seven arches');
    await expect(page).toHaveURL(/\/aleppo#bridge$/);

    const times = page.getByRole('group', { name: 'Time of day' }).getByRole('button');
    await expect(times).toHaveCount(4);
    await times.filter({ hasText: 'Night' }).click();
    await expect(times.filter({ hasText: 'Night' })).toHaveAttribute('aria-pressed', 'true');
    await expect(times.filter({ hasText: 'Sunset' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#citadel')).toHaveAttribute('data-time', 'layl');

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('#info')).toBeHidden();
    await expect(places.filter({ hasText: 'The bridge' })).toBeFocused();

    const scroll = await page.evaluate(() => ({
      h: document.scrollingElement!.scrollHeight - window.innerHeight,
      w: document.scrollingElement!.scrollWidth - window.innerWidth,
    }));
    expect(scroll).toEqual({ h: 0, w: 0 });
    expect(errors).toEqual([]);
  });

  test('a link to a place opens on it', async ({ page }) => {
    await page.goto('/aleppo#minaret');
    await expect(page.locator('#citadel')).toHaveAttribute('data-place', 'minaret', { timeout: 30_000 });
    await expect(page.locator('#info')).toContainText('21 m tall');
  });

  test('has no WCAG A/AA violations in its HTML controls', async ({ page }) => {
    await page.goto('/aleppo');
    await expect(page.locator('#citadel')).toHaveAttribute('data-ready', '', { timeout: 30_000 });
    await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: /The gate/ }).click();
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('#stage')
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });
});
