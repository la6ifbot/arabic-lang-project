import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, seed, test, waitForSea } from './accounts';

const SAVED = [
  { slug: 'bahr', savedAt: '2026-09-01T10:00:00.000Z' },
  { slug: 'hanin', savedAt: '2026-09-10T10:00:00.000Z' },
];

// WCAG 2.1 A/AA rules. Colour contrast over the WebGL canvas can't be computed by axe, so the scene's
// own canvas is excluded; every HTML control on top of it is checked.
const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('[data-testid=scene]');

test.describe('accessibility (axe)', () => {
  test('sea with the sign-in dialog open', async ({ page }) => {
    await page.goto('/word/hanin');
    await waitForSea(page);
    await page.getByTestId('save-button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const { violations } = await scan(page).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });

  test('sea with the account menu open', async ({ page }) => {
    await seed(page, { signedIn: true, saved: SAVED });
    await page.goto('/word/hanin');
    await waitForSea(page);
    await page.getByTestId('account-button').click();
    await expect(page.getByRole('menu')).toBeVisible();
    const { violations } = await scan(page).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });

  test('Library with pearls, and the delete dialog', async ({ page }) => {
    await seed(page, { signedIn: true, saved: SAVED });
    await page.goto('/library');
    await expect(page.getByTestId('library-count')).toHaveText('0 in the deep · 0 still learning · 2 saved');
    let { violations } = await scan(page).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);

    await page.getByTestId('account-button').click();
    await page.getByRole('menuitem', { name: /Delete my account/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    ({ violations } = await scan(page).analyze());
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });

  test('Library signed out, and Privacy', async ({ page }) => {
    await page.goto('/library');
    await expect(page.getByTestId('library-signed-out')).toBeVisible();
    let { violations } = await scan(page).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
    ({ violations } = await scan(page).analyze());
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });
});
