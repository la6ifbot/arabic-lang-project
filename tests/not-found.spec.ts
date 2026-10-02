import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Vercel serves dist/404.html with a 404 status for any path that isn't a file (vercel.json has no
// catch-all rewrite; see tests/unit/notFound.test.ts). The preview server does the same (vite.config.ts).
test('every app route is a real page, not the 404', async ({ request }) => {
  for (const path of ['/', '/word/bahr', '/library', '/privacy', '/subscribe/confirm', '/unsubscribe']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(await res.text(), path).not.toContain('Page not found');
  }
});

test('the 404 page: a lost pearl, a word search and the way back, never indexed', async ({ page, request }) => {
  const res = await request.get('/no-such-page');
  expect(res.status()).toBe(404);
  const html = await res.text();
  expect(html).toContain('<meta name="robots" content="noindex" />');
  expect(html).toContain('<title>Page not found · Durar</title>');
  expect(html).not.toContain('rel="canonical"');
  expect(html).not.toContain('type="module"'); // static: none of the app's JavaScript

  expect((await page.goto('/word/not-a-word'))?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A lost pearl');
  await expect(page.locator('h1 [lang=ar]')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('link', { name: 'Back to the sea' }).last()).toHaveAttribute('href', '/');

  const search = page.getByRole('searchbox', { name: 'Look for a word instead' });
  const first = page.locator('.lost-results a').first();
  await search.fill('sea');
  await expect(first).toHaveAttribute('href', '/word/bahr');
  await search.fill('بحر');
  await expect(first).toHaveAttribute('href', '/word/bahr');
  await search.fill('zzzz');
  await expect(page.getByRole('status')).toHaveText('No word matches that yet.');

  await search.fill('uns'); // the word itself comes before meanings that merely contain the letters
  await search.press('Enter');
  await expect(page).toHaveURL(/\/word\/uns$/);

  await page.goto('/word/not-a-word');
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
});
