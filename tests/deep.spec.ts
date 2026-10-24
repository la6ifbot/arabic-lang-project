import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { dialog, expect, seed, test, waitForSea, type SeedDiver, type SeedProgress } from './accounts';
import { today } from './helpers';
import words from '../src/data/words.json' with { type: 'json' };

const DAY = 86_400_000;
const potd = today().slug;
const W = words.map((w) => w.slug).filter((s) => s !== potd);
const iso = (ms: number) => new Date(ms).toISOString();

/** Twelve other divers, deepest first; the earlier `at` wins ties. */
const DIVERS: SeedDiver[] = Array.from({ length: 12 }, (_, i) => ({
  name: i === 1 ? 'لؤلؤة البحر' : `Diver ${101 + i}`,
  depth: 200 - i * 10,
  pearls: 50 - i,
  week: i < 3 ? 30 - i * 5 : 0,
  at: iso(Date.parse('2026-10-01T08:00:00Z') + i * 1000),
}));

/** Layla's verified progress: depth 2 + 3 = 5, two pearls in the deep, gained before this week. */
const verified = (slug: string, box: number): SeedProgress => ({
  slug,
  box,
  dueAt: iso(Date.now() + 5 * DAY),
  lastReviewedAt: iso(Date.now() - DAY),
  timesSeen: box,
  lapses: 0,
  verifiedBox: box,
  verifiedAt: iso(Date.now() - DAY),
});

const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
const noViolations = async (page: Page) => {
  const { violations } = await axe(page).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
};
const rows = (page: Page) => page.locator('[role=tabpanel] .deep-row');

test.describe('The Deep', () => {
  // The Deep is parked behind VITE_DEEP_ENABLED (off by default); these run with it on so it keeps working.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __DURAR_DEEP__: boolean }).__DURAR_DEEP__ = true;
    });
  });

  test('signed out: both boards are readable, with an invitation to join; noindex', async ({ page }) => {
    await seed(page, { divers: DIVERS });
    await page.goto('/deep');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('The Deep');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    // This week first: only the three who went deeper since Monday.
    await expect(page.getByRole('tab', { name: 'This week' })).toHaveAttribute('aria-selected', 'true');
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).first()).toContainText('Diver 101');
    await expect(rows(page).first()).toContainText('+30 depth');
    await expect(page.getByTestId('deep-divers')).toHaveText('3 divers went deeper this week');
    // Keyboard: arrows move between the tabs.
    await page.getByRole('tab', { name: 'This week' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'All time' })).toBeFocused();
    await expect(rows(page)).toHaveCount(10);
    await expect(rows(page).nth(0)).toContainText('50 pearls in the deep · 200 depth');
    await expect(page.getByTestId('deep-divers')).toHaveText('12 divers');
    // An Arabic name stays isolated, written right to left.
    await expect(rows(page).nth(1).locator('bdi')).toHaveText('لؤلؤة البحر');
    await expect(page.getByRole('button', { name: 'Sign in to join' })).toBeVisible();
    await noViolations(page);
  });

  test('empty boards say so calmly', async ({ page }) => {
    await page.goto('/deep');
    await expect(page.getByTestId('deep-empty')).toHaveText('Still water so far this week. Depth gained since Monday shows here.');
    await page.getByRole('tab', { name: 'All time' }).click();
    await expect(page.getByTestId('deep-empty')).toHaveText('The deep is still quiet. Nobody has dived this far yet.');
  });

  test('join from the account menu with a chosen name; your rank follows the top 10', async ({ page }) => {
    await seed(page, { signedIn: true, divers: DIVERS, progress: [verified(W[0], 2), verified(W[1], 3)] });
    await page.goto('/library');
    await page.getByTestId('account-button').click();
    await page.getByRole('menuitem', { name: 'Join The Deep' }).click();
    await expect(page).toHaveURL(/\/deep#join$/);
    const d = dialog(page);
    await expect(d.getByRole('heading')).toHaveText('Join The Deep');
    await expect(d).toContainText('Everyone can see this name with your rank and depth');
    await noViolations(page);
    // Shape problems are explained before anything is sent; the server's answers too.
    await d.getByLabel('Name', { exact: true }).fill('Layla🌊');
    await d.getByRole('button', { name: 'Join' }).click();
    await expect(d.getByRole('alert')).toContainText('No emoji or symbols');
    await d.getByLabel('Name', { exact: true }).fill('Diver 101');
    await d.getByRole('button', { name: 'Join' }).click();
    await expect(d.getByRole('alert')).toContainText('reserved');
    await d.getByLabel('Name', { exact: true }).fill('لؤلؤة  البحر');
    await d.getByRole('button', { name: 'Join' }).click();
    await expect(d.getByRole('alert')).toContainText('Another diver already has that name');
    await d.getByLabel('Name', { exact: true }).fill('  قمر الليل ');
    await d.getByRole('button', { name: 'Join' }).click();
    await expect(d).toHaveCount(0);
    await expect(page.getByTestId('deep-join')).toContainText('You dive as قمر الليل.');

    await page.getByRole('tab', { name: 'All time' }).click();
    await expect(rows(page)).toHaveCount(11);
    const mine = page.locator('.deep-row[data-me]');
    await expect(mine).toContainText('13');
    await expect(mine).toContainText('2 pearls in the deep · 5 depth');
    await expect(page.getByTestId('deep-you')).toHaveText('You’re #13 of 13 divers.');
    await page.getByRole('tab', { name: 'This week' }).click();
    await expect(page.getByTestId('deep-you')).toHaveText('You haven’t gone deeper yet this week. The week starts again each Monday.');
    await noViolations(page);
  });

  test('a generated name; renaming once a day; leaving removes the name at once', async ({ page }) => {
    await seed(page, { signedIn: true, divers: DIVERS, progress: [verified(W[2], 4)] });
    await page.goto('/deep');
    await page.getByRole('button', { name: 'Join The Deep' }).click();
    await dialog(page).getByLabel('Give me one, like “Diver 142”').check();
    await dialog(page).getByRole('button', { name: 'Join' }).click();
    await expect(page.getByTestId('deep-join')).toContainText(/You dive as Diver \d+\./);
    await expect(page.getByTestId('account-status')).toContainText(/You’ve joined The Deep as Diver \d+\./);

    await page.getByRole('button', { name: 'Change name' }).click();
    await dialog(page).getByLabel('Name', { exact: true }).fill('Layla');
    await dialog(page).getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByTestId('deep-join')).toContainText('You dive as Layla.');
    await page.getByRole('tab', { name: 'All time' }).click();
    await expect(page.locator('.deep-row[data-me]')).toContainText('Layla');
    // A second change the same day waits.
    await page.getByRole('button', { name: 'Change name' }).click();
    await expect(dialog(page)).toContainText('You can change your name again');
    await dialog(page).getByRole('button', { name: 'OK' }).click();

    await page.getByRole('button', { name: 'Leave The Deep' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Stay' })).toBeFocused();
    await dialog(page).getByRole('button', { name: 'Leave' }).click();
    await expect(page.getByRole('button', { name: 'Join The Deep' })).toBeVisible();
    await expect(page.locator('.deep-row', { hasText: 'Layla' })).toHaveCount(0);
    await expect(page.getByTestId('account-status')).toContainText('You’ve left The Deep');
  });

  test('deleting the account removes the entry', async ({ page }) => {
    await seed(page, { signedIn: true, member: 'Layla', progress: [verified(W[3], 3)] });
    await page.goto('/deep');
    await page.getByRole('tab', { name: 'All time' }).click();
    await expect(page.locator('.deep-row[data-me]')).toContainText('Layla');
    await page.getByTestId('account-button').click();
    await page.getByRole('menuitem', { name: /Delete my account/ }).click();
    await dialog(page).getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByTestId('sign-in')).toBeVisible();
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem('durar-mock-db')!));
    expect(db.deep.members).toEqual({});
  });

  test('right on a word that isn’t due: “Already in the deep”, and the box stays', async ({ page }) => {
    await page.addInitScript((value) => {
      if (!localStorage.getItem('durar-progress')) localStorage.setItem('durar-progress', value);
    }, JSON.stringify({ v: 1, seed: 'test-seed', items: [{ slug: W[4], box: 3, dueAt: iso(Date.now() + 5 * DAY + 60_000), lastReviewedAt: iso(Date.now() - 2 * DAY), timesSeen: 3, lapses: 0 }] }));
    await page.goto(`/word/${W[4]}`);
    await waitForSea(page);
    await expect(page.getByTestId('progress-note')).toHaveAttribute('data-progress', 'ready', { timeout: 20_000 });
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('progress-status')).toHaveText('Already in the deep · returns in 6 days');
    const copy = await page.evaluate(() => JSON.parse(localStorage.getItem('durar-progress')!));
    expect(copy.items.find((p: SeedProgress) => p.slug === W[4]).box).toBe(3);
  });
});

test.describe('The Deep, parked (flag off)', () => {
  test('no way in anywhere, and /deep opens the sea at /', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __DURAR_DEEP__: boolean }).__DURAR_DEEP__ = false;
      localStorage.removeItem('durar-help-seen'); // the first-visit help opens too
    });
    await seed(page, { signedIn: true, member: 'Layla', divers: DIVERS, progress: [verified(W[3], 3)] });
    const noWayIn = async () => {
      await expect(page.locator('a[href^="/deep"]')).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText('The Deep');
    };

    await page.goto('/deep');
    await waitForSea(page);
    await expect(page).not.toHaveURL(/\/deep/);
    await expect(page.getByTestId('help-box')).toBeVisible(); // first-visit help
    await noWayIn();
    await page.getByTestId('about-open').click();
    await expect(page.getByRole('dialog', { name: 'What is Durar?' })).toBeVisible();
    await noWayIn();
    await page.keyboard.press('Escape');

    await page.getByTestId('account-button').click();
    await expect(page.getByRole('menu', { name: 'Account' })).toBeVisible();
    await expect(page.getByTestId('deep-menu')).toHaveCount(0);
    await noWayIn();
    await page.getByRole('menuitem', { name: /My Pearls/ }).click();

    await expect(page.getByTestId('library-count')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'In the deep', exact: true })).toBeVisible(); // mastery stays
    await expect(page.getByTestId('library-deep')).toHaveCount(0);
    await noWayIn();

    await page.goto('/privacy');
    await expect(page.getByTestId('privacy-deep')).toContainText('paused');
    await expect(page.locator('a[href^="/deep"]')).toHaveCount(0);
  });
});
