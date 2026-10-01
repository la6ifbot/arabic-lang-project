import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Vercel serves dist/404.html with a 404 status for any path that isn't a file (vercel.json has no
// catch-all rewrite; see tests/unit/notFound.test.ts). The local preview server has no such rule,
// so the page is checked at its own path.
test('the 404 page: a lost pearl, a word search and the way back, never indexed', async ({ page, request }) => {
  const html = await (await request.get('/404.html')).text();
  expect(html).toContain('<meta name="robots" content="noindex" />');
  expect(html).toContain('<title>Page not found · Durar</title>');
  expect(html).not.toContain('rel="canonical"');
  expect(html).not.toContain('type="module"'); // static: none of the app's JavaScript

  await page.goto('/404.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A lost pearl');
  await expect(page.locator('h1 [lang=ar]')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('link', { name: 'Back to the sea' }).last()).toHaveAttribute('href', '/');

  const search = page.getByRole('searchbox', { name: 'Look for a word instead' });
  await search.fill('sea');
  await expect(page.getByRole('link', { name: /بَحْر/ })).toHaveAttribute('href', '/word/bahr');
  await search.fill('بحر');
  await expect(page.getByRole('link', { name: /بَحْر/ })).toBeVisible();
  await search.fill('zzzz');
  await expect(page.getByRole('status')).toHaveText('No word matches that yet.');

  await search.fill('bahr');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/word\/bahr$/);

  await page.goto('/404.html');
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
});
