import { expect, type Page } from '@playwright/test';

export const focused = (page: Page) => page.getByTestId('focused-word');

export async function focusedSlug(page: Page) {
  return (await focused(page).getAttribute('data-slug')) ?? '';
}

/** Waits for the 3D scene to have mounted (fonts loaded, canvas present). */
export async function waitForScene(page: Page) {
  await expect(page.locator('[data-testid=scene] canvas')).toBeVisible();
  await page.waitForTimeout(400);
}

export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}
