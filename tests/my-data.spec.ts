import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';
import { expect, LAYLA, seed, status, test, waitForSea } from './accounts';

const SAVED = [{ slug: 'bahr', savedAt: '2026-09-01T10:00:00.000Z' }];
const PROGRESS = [{ slug: 'najm', box: 3, dueAt: '2026-10-10T08:00:00.000Z', lastReviewedAt: '2026-10-03T08:00:00.000Z', timesSeen: 4, lapses: 1 }];

async function readJson(download: Download) {
  expect(download.suggestedFilename()).toMatch(/^durar-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  return JSON.parse(await readFile((await download.path())!, 'utf8'));
}

async function subscribed(page: Page) {
  await page.addInitScript((email) => {
    if (!localStorage.getItem('durar-mock-email')) localStorage.setItem('durar-mock-email', JSON.stringify({ [email]: 'confirmed' }));
  }, LAYLA.email);
}

test.describe('Download my data', () => {
  test('the account menu downloads a JSON file with the account, pearls, progress and subscription', async ({ page }) => {
    await seed(page, { signedIn: true, saved: SAVED, progress: PROGRESS });
    await subscribed(page);
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('account-button').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Download my data' }).click()]);
    const data = await readJson(download);
    expect(data.account).toMatchObject({ email: LAYLA.email, sign_in_method: 'email' });
    expect(data.saved_pearls).toEqual([{ word: 'bahr', saved_at: SAVED[0].savedAt }]);
    expect(data.progress).toEqual([
      { word: 'najm', box: 3, due_at: PROGRESS[0].dueAt, last_reviewed_at: PROGRESS[0].lastReviewedAt, times_seen: 4, lapses: 1 },
    ]);
    expect(data.email_subscription).toMatchObject({ email: LAYLA.email, status: 'confirmed' });
    expect(data).toHaveProperty('the_deep', null);
    expect(data.exported_at).toMatch(/^\d{4}-/);
    await expect(status(page)).toContainText('Your data has been downloaded');
  });

  test('works the same in the text-only view', async ({ page }) => {
    await seed(page, { signedIn: true, saved: SAVED });
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('mode-toggle').click();
    await expect(page.getByTestId('text-view')).toBeVisible();
    await page.getByTestId('account-button').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Download my data' }).click()]);
    expect((await readJson(download)).saved_pearls).toHaveLength(1);
  });

  test('the Privacy page lists every service, explains retention, and offers the download when signed in', async ({ page }) => {
    await page.goto('/privacy');
    const services = page.getByTestId('privacy-services');
    for (const name of ['Vercel', 'Supabase', 'Amazon SES', 'CloudFront', 'Cloudflare Turnstile', 'Namecheap', 'Google', 'GitHub', 'UptimeRobot']) {
      await expect(services).toContainText(name);
    }
    await expect(page.getByRole('heading', { name: 'How long we keep things' })).toBeVisible();
    await expect(page.getByTestId('privacy-download')).toHaveCount(0);
  });

  test('signed in, the Privacy page downloads too and says so on the page; axe clean', async ({ page }) => {
    await seed(page, { signedIn: true, saved: SAVED });
    await page.goto('/privacy');
    const button = page.getByTestId('privacy-download');
    await expect(button).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
    expect((await readJson(download)).account.email).toBe(LAYLA.email);
    await expect(page.getByTestId('privacy-download-status')).toHaveText('Your data has been downloaded as a JSON file.');
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });

  test('a failure says so, in words', async ({ page }) => {
    await seed(page, { signedIn: true });
    await page.goto('/privacy');
    await expect(page.getByTestId('privacy-download')).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __durarMock: { failNext: (op: string, kind: string) => void } }).__durarMock.failNext('exportMyData', 'network');
    });
    await page.getByTestId('privacy-download').click();
    await expect(page.getByTestId('privacy-download-status')).toContainText('We couldn’t prepare your data.');
  });
});
