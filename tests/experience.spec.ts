import { expect, test } from '@playwright/test';
import { focused, focusedSlug, trackErrors, waitForScene } from './helpers';

test.describe('immersive scene', () => {
  test('opens on the first pearl with no errors and no scrolling', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await waitForScene(page);
    await expect(focused(page)).toHaveAttribute('data-slug', 'durrah');
    await expect(focused(page).locator('h1')).toHaveText('دُرَّة');
    await expect(focused(page).locator('h1')).toHaveAttribute('dir', 'rtl');
    const scroll = await page.evaluate(() => ({
      h: document.scrollingElement!.scrollHeight - window.innerHeight,
      w: document.scrollingElement!.scrollWidth - window.innerWidth,
    }));
    expect(scroll).toEqual({ h: 0, w: 0 });
    expect(errors).toEqual([]);
  });

  test('arrow keys swipe: right = known, left = still learning (resurfaces soon)', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const first = await focusedSlug(page);
    await page.keyboard.press('ArrowRight');
    await expect(focused(page)).not.toHaveAttribute('data-slug', first);
    await expect(page).toHaveURL(/\/word\/[a-z-]+$/);

    const learning = await focusedSlug(page);
    await page.keyboard.press('ArrowLeft');
    await expect(focused(page)).not.toHaveAttribute('data-slug', learning);
    // Reinserted a few cards later: it comes back after three more swipes.
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect(focused(page)).toHaveAttribute('data-slug', learning);
  });

  test('mouse drag past the threshold swipes; a short drag springs back', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const start = await focusedSlug(page);
    const { width, height } = page.viewportSize()!;

    await page.mouse.move(width / 2, height / 2);
    await page.mouse.down();
    await page.mouse.move(width / 2 + 40, height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(focused(page)).toHaveAttribute('data-slug', start);

    await page.mouse.move(width / 2, height / 2);
    await page.mouse.down();
    await page.mouse.move(width / 2 + 320, height / 2 + 10, { steps: 12 });
    await page.mouse.up();
    await expect(focused(page)).not.toHaveAttribute('data-slug', start);
  });

  test('trackpad horizontal swipe (wheel deltaX) swipes once per gesture', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const { width, height } = page.viewportSize()!;
    await page.mouse.move(width / 2, height / 2);
    const order: string[] = [await focusedSlug(page)];
    // Fingers moving right → negative deltaX → “known”; followed by a momentum tail.
    await page.mouse.wheel(-200, 0);
    await page.waitForTimeout(100);
    order.push(await focusedSlug(page));
    expect(order[1]).not.toBe(order[0]);
    // The momentum tail right after the commit must not trigger a second swipe.
    for (let i = 0; i < 3; i++) await page.mouse.wheel(-60, 0);
    await page.waitForTimeout(300);
    expect(await focusedSlug(page)).toBe(order[1]);
  });

  test('on-screen controls are keyboard reachable buttons', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const start = await focusedSlug(page);
    await page.getByTestId('btn-known').focus();
    await page.keyboard.press('Enter');
    await expect(focused(page)).not.toHaveAttribute('data-slug', start);
    await expect(page.getByRole('button', { name: /still learning/i })).toBeVisible();
  });
});

test.describe('search', () => {
  test('English query autocompletes and surfaces the card', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const box = page.getByRole('combobox');
    await box.fill('sea');
    const option = page.getByRole('option').first();
    await expect(option).toContainText('baḥr');
    await box.press('Enter');
    await expect(focused(page)).toHaveAttribute('data-slug', 'bahr');
    await expect(page).toHaveURL(/\/word\/bahr$/);
    await expect(page).toHaveTitle(/baḥr/);
    await expect(page.getByRole('listbox')).toHaveCount(0);
  });

  test('Arabic query ignores diacritics and hamza variants', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const box = page.getByRole('combobox');
    await box.fill('امل');
    await expect(page.getByRole('option').first()).toContainText('amal');
    await box.fill('الحنين');
    await expect(page.getByRole('option').first()).toContainText('ḥanīn');
  });

  test('transliteration, keyboard navigation and “/” shortcut', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await page.keyboard.press('/');
    await expect(page.getByRole('combobox')).toBeFocused();
    await page.keyboard.type('sa');
    await expect(page.getByRole('option').nth(1)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    const second = page.getByRole('option').nth(1);
    await expect(second).toHaveAttribute('aria-selected', 'true');
    const text = await second.locator('.search-tr').textContent();
    await page.keyboard.press('Enter');
    await expect(focused(page).locator('p').first()).toHaveText(text!);
  });

  test('clicking a suggestion works and arrow keys in the box do not swipe', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await page.getByRole('combobox').fill('rain');
    await page.keyboard.press('ArrowRight');
    await expect(focused(page)).toHaveAttribute('data-slug', 'durrah');
    await page.getByRole('option', { name: /ghayth/ }).click();
    await expect(focused(page)).toHaveAttribute('data-slug', 'ghayth');
  });

  test('an unknown word shows a gentle empty state', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('combobox').fill('zzzz');
    await expect(page.getByText(/no pearl by that name/i)).toBeVisible();
  });
});

test.describe('routes & SEO', () => {
  test('deep link opens that word', async ({ page }) => {
    await page.goto('/word/tarab');
    await waitForScene(page);
    await expect(focused(page)).toHaveAttribute('data-slug', 'tarab');
    await expect(page).toHaveTitle(/ṭarab/);
  });

  test('unknown word routes fall back to the home experience', async ({ page }) => {
    await page.goto('/word/not-a-word');
    await waitForScene(page);
    await expect(focused(page)).toHaveAttribute('data-slug', 'durrah');
  });

  test('word pages are prerendered with meta tags and content', async ({ request }) => {
    const html = await (await request.get('/word/hanin')).text();
    expect(html).toContain('<title>حَنِين (ḥanīn) — longing, nostalgia · Durar</title>');
    expect(html).toMatch(/<meta property="og:title" content="حَنِين/);
    expect(html).toMatch(/<meta name="twitter:card" content="summary"/);
    expect(html).toContain('"@type":"DefinedTerm"');
    expect(html).toContain('يملؤني الحنين إلى بيت جدي.');
  });

  test('home page links every word for crawlers', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toContain('href="/word/bahr"');
    expect((html.match(/href="\/word\//g) ?? []).length).toBeGreaterThanOrEqual(100);
  });
});

test.describe('fallbacks & accessibility', () => {
  test('text-only view toggles on and off and still swipes', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await page.getByTestId('mode-toggle').click();
    await expect(page.getByTestId('text-view')).toBeVisible();
    await expect(page.getByTestId('html-card').locator('h2')).toHaveText('دُرَّة');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('html-card').locator('h2')).not.toHaveText('دُرَّة');
    await page.getByTestId('mode-toggle').click();
    await expect(page.locator('[data-testid=scene] canvas')).toBeVisible();
  });

  test('the live region announces the focused word', async ({ page }) => {
    await page.goto('/');
    const region = focused(page);
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(region.locator('[lang=ar]').first()).toBeAttached();
  });
});
