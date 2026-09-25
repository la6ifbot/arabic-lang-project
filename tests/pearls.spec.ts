import { dialog, expect, LAYLA, saveButton, seed, signInViaDialog, status, test, waitForSea, waitForServer } from './accounts';

type Mock = { __durarMock: { failNext(op: string, code?: string): void } };
const failNext = (op: string) => (window as unknown as Mock).__durarMock.failNext(op);

test.describe('save to My Pearls', () => {
  test('save and unsave the focused card with the mouse and the S key; it persists', async ({ page }) => {
    await seed(page, { signedIn: true });
    await page.goto('/word/najm');
    await waitForSea(page);
    await expect(page.getByTestId('account-button')).toBeVisible();
    const btn = saveButton(page);
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await expect(btn).toHaveAccessibleName('Save نَجْم to My Pearls');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(status(page)).toHaveText('Saved نَجْم to My Pearls.');
    await waitForServer(page, 'najm', true);

    await page.reload();
    await waitForSea(page);
    await expect(saveButton(page)).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('s');
    await expect(saveButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(status(page)).toHaveText('Removed نَجْم from My Pearls.');
    await page.keyboard.press('S');
    await expect(saveButton(page)).toHaveAttribute('aria-pressed', 'true');

    // Swiping moves on to a new, unsaved card.
    await page.keyboard.press('ArrowRight');
    await expect(saveButton(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('a failed save rolls back and says why', async ({ page }) => {
    await seed(page, { signedIn: true });
    await page.goto('/word/badr');
    await waitForSea(page);
    await expect(page.getByTestId('account-button')).toBeVisible();
    await page.evaluate(failNext, 'save');
    await saveButton(page).click();
    await expect(saveButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.save-error')).toContainText('Couldn’t save بَدْر.');
    await expect(status(page)).toContainText('Couldn’t save بَدْر');
  });

  test('signed out: saving asks you to sign in, then keeps that word', async ({ page }) => {
    await seed(page);
    await page.goto('/word/sabr');
    await waitForSea(page);
    await saveButton(page).click();
    await expect(dialog(page)).toContainText('Sign in to keep this pearl');
    await expect(dialog(page)).toContainText('صَبْر');
    await signInViaDialog(page);
    await expect(dialog(page)).toHaveCount(0);
    await expect(saveButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('focused-word')).toHaveAttribute('data-slug', 'sabr');
    await waitForServer(page, 'sabr', true);
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem('durar-mock-db')!));
    expect(db.saved[LAYLA.id].map((p: { slug: string }) => p.slug)).toEqual(['sabr']);
  });

  test('closing the sign-in dialog forgets the save', async ({ page }) => {
    await seed(page);
    await page.goto('/word/sabr');
    await waitForSea(page);
    await page.keyboard.press('s');
    await expect(dialog(page)).toContainText('Sign in to keep this pearl');
    await page.keyboard.press('Escape');
    await page.getByTestId('sign-in').click();
    await signInViaDialog(page);
    await expect(page.getByTestId('account-button')).toBeVisible();
    await expect(saveButton(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('the text-only view has the same save control', async ({ page }) => {
    await seed(page, { signedIn: true });
    await page.goto('/word/ward');
    await waitForSea(page);
    await page.getByTestId('mode-toggle').click();
    const card = page.getByTestId('html-card');
    await expect(card.getByTestId('save-button')).toBeVisible();
    await card.getByTestId('save-button').click();
    await expect(card.getByTestId('save-button')).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toHaveAttribute('data-glint', 'true');
    await page.keyboard.press('s');
    await expect(card.getByTestId('save-button')).toHaveAttribute('aria-pressed', 'false');
  });
});

const SAVED = [
  { slug: 'bahr', savedAt: '2026-09-01T10:00:00.000Z' },
  { slug: 'hanin', savedAt: '2026-09-10T10:00:00.000Z' },
  { slug: 'amal', savedAt: '2026-09-05T10:00:00.000Z' },
  { slug: 'retired-word', savedAt: '2026-09-12T10:00:00.000Z' },
];

test.describe('Library', () => {
  test('signed out, /library invites you to sign in, then shows your pearls', async ({ page }) => {
    await seed(page, { saved: SAVED });
    await page.goto('/library');
    await expect(page.getByTestId('library-signed-out')).toContainText('Sign in to save pearls and carry your progress to any device.');
    await page.getByTestId('library-signed-out').getByRole('button', { name: 'Sign in' }).click();
    await signInViaDialog(page);
    await expect(page.getByTestId('library-count')).toHaveText('0 in the deep · 0 still learning · 3 saved');
  });

  test('lists, counts and sorts saved words, skipping words that no longer exist', async ({ page }) => {
    await seed(page, { signedIn: true, saved: SAVED });
    await page.goto('/library');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My Pearls');
    await expect(page.getByTestId('library-count')).toHaveText('0 in the deep · 0 still learning · 3 saved');
    const slugs = () => page.getByTestId('library-list').locator('a').evaluateAll((els) => els.map((e) => e.getAttribute('data-slug')));
    expect(await slugs()).toEqual(['hanin', 'amal', 'bahr']);
    await page.getByRole('button', { name: /Alphabetical/ }).click();
    await expect(page.getByRole('button', { name: /Alphabetical/ })).toHaveAttribute('aria-pressed', 'true');
    expect(await slugs()).toEqual(['amal', 'bahr', 'hanin']);
    await expect(page.getByTestId('library-list').locator('[lang="ar"]').first()).toHaveAttribute('dir', 'rtl');
    await expect(page).toHaveTitle('My Pearls · Durar');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  test('remove with undo; a removal without undo sticks', async ({ page }) => {
    await seed(page, { signedIn: true, saved: SAVED });
    await page.goto('/library');
    await expect(page.getByTestId('library-count')).toHaveText('0 in the deep · 0 still learning · 3 saved');
    await page.getByRole('button', { name: /Remove أَمَل/ }).click();
    await expect(page.getByTestId('library-count')).toHaveText('0 in the deep · 0 still learning · 2 saved');
    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeFocused();
    await undo.click();
    await expect(page.getByTestId('library-count')).toHaveText('0 in the deep · 0 still learning · 3 saved');
    // Restored to its original place in “Newest”.
    const first = await page.getByTestId('library-list').locator('a').nth(1).getAttribute('data-slug');
    expect(first).toBe('amal');

    await page.getByRole('button', { name: /Remove بَحْر/ }).click();
    await expect(page.getByTestId('library-count')).toHaveText('0 in the deep · 0 still learning · 2 saved');
    await waitForServer(page, 'bahr', false);
    await page.reload();
    await expect(page.getByTestId('library-count')).toHaveText('0 in the deep · 0 still learning · 2 saved');
    await expect(page.getByTestId('library-list')).not.toContainText('بَحْر');
  });

  test('clicking a pearl opens the sea on that word', async ({ page }) => {
    await seed(page, { signedIn: true, saved: SAVED });
    await page.goto('/library');
    await page.getByTestId('library-list').getByRole('link', { name: /ḥanīn/ }).click();
    await expect(page).toHaveURL(/\/word\/hanin$/);
    await waitForSea(page);
    await expect(page.getByTestId('focused-word')).toHaveAttribute('data-slug', 'hanin');
    await expect(saveButton(page)).toHaveAttribute('aria-pressed', 'true');
    await page.goBack();
    await expect(page.getByTestId('library-count')).toBeVisible();
  });

  test('the account menu opens the Library; an empty Library invites exploring', async ({ page }) => {
    await seed(page, { signedIn: true });
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('account-button').click();
    await page.getByRole('menuitem', { name: /My Pearls/ }).click();
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByTestId('library-empty-all')).toContainText('No pearls yet.');
    await expect(page.getByTestId('library-empty-all')).toContainText('Every word you swipe finds its place here');
    await page.getByRole('link', { name: 'Dive in' }).click();
    await waitForSea(page);
  });

  test('the Library is noindex in the served HTML and left out of the sitemap', async ({ request }) => {
    const html = await (await request.get('/library')).text();
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toContain('rel="canonical"');
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok(), 'build with SITE_URL set so sitemap.xml exists').toBe(true);
    const xml = await sitemap.text();
    expect(xml).toContain('/word/bahr</loc>');
    expect(xml).toContain('/privacy</loc>');
    expect(xml).not.toContain('/library');

    // With SITE_URL set, word pages and robots.txt point at the absolute production URL.
    const origin = new URL(xml.match(/<loc>(.*?)<\/loc>/)![1]).origin;
    const word = await (await request.get('/word/bahr')).text();
    expect(word).toContain(`<link rel="canonical" href="${origin}/word/bahr" />`);
    expect(word).toContain(`<meta property="og:url" content="${origin}/word/bahr" />`);
    expect(await (await request.get('/robots.txt')).text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
  });
});
