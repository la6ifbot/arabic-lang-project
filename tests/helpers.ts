import { expect, type BrowserContext, type Page } from '@playwright/test';

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

import words from '../src/data/words.json' with { type: 'json' };
import { pearlOfTheDay } from '../shared/pearlOfTheDay';

/** Today's Pearl of the Day, computed exactly as the site does. */
export function today() {
  const slug = pearlOfTheDay(words).slug;
  return words.find((w) => w.slug === slug)!;
}

let art: Promise<Buffer> | undefined;
/** A small pale-aqua square standing in for a rendered illustration. */
const fixtureArt = () =>
  (art ??= import('sharp').then(({ default: sharp }) =>
    sharp({ create: { width: 320, height: 320, channels: 4, background: { r: 207, g: 238, b: 240, alpha: 0.9 } } }).webp().toBuffer(),
  ));

/**
 * Serves img.durar.space illustrations from a generated fixture, so tests never depend on the image host.
 * Returns the requests seen. cors: false answers with another origin's CORS header, as a misconfigured host would.
 */
export async function routeIllustrations(target: Page | BrowserContext, { cors = true } = {}) {
  const seen: { url: string; origin?: string }[] = [];
  await target.route('https://img.durar.space/illustrations/**', async (route) => {
    seen.push({ url: route.request().url(), origin: (await route.request().allHeaders()).origin });
    await route.fulfill({
      body: await fixtureArt(),
      headers: { 'content-type': 'image/webp', 'access-control-allow-origin': cors ? '*' : 'https://elsewhere.example' },
    });
  });
  return seen;
}
