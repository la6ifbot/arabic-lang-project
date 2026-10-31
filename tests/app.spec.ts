import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The text-only sea (no WebGL) loads in a moment and has the same corner buttons as the 3D one.
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'], executablePath: process.env.PW_CHROMIUM_PATH || undefined } });

const fsButton = (page: Page) => page.getByTestId('fullscreen-button');
const inFullscreen = (page: Page) => page.evaluate(() => document.fullscreenElement !== null);

/** Safari on iPhone, by its features: navigator.standalone exists and element fullscreen is not allowed. */
async function asIPhone(page: Page, { installed = false } = {}) {
  await page.addInitScript((installed) => {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => installed, configurable: true });
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true });
  }, installed);
}

const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test.describe('fullscreen', () => {
  test('the button enters and leaves fullscreen, and so does F; it starts off', async ({ page }) => {
    await page.goto('/word/sabr');
    await expect(page.getByTestId('html-card')).toBeVisible();
    await expect(fsButton(page)).toHaveAccessibleName('Full screen');
    expect(await inFullscreen(page)).toBe(false);

    await fsButton(page).click();
    await expect.poll(() => inFullscreen(page)).toBe(true);
    await expect(fsButton(page)).toHaveAccessibleName('Exit full screen');
    await fsButton(page).click();
    await expect.poll(() => inFullscreen(page)).toBe(false);
    await expect(fsButton(page)).toHaveAccessibleName('Full screen');

    await page.keyboard.press('f');
    await expect.poll(() => inFullscreen(page)).toBe(true);
    await page.keyboard.press('F');
    await expect.poll(() => inFullscreen(page)).toBe(false);

    // Typing an f in the search box is just typing.
    await page.getByRole('combobox').fill('');
    await page.getByRole('combobox').press('f');
    expect(await inFullscreen(page)).toBe(false);
  });

  test('the button works from the keyboard and passes axe', async ({ page }) => {
    await page.goto('/word/sabr');
    await fsButton(page).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => inFullscreen(page)).toBe(true);
    await expect(fsButton(page)).toBeFocused();
    const { violations } = await axe(page);
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });

  test('hidden where the browser can’t go fullscreen (iPhone), and F does nothing', async ({ page }) => {
    await asIPhone(page);
    await page.goto('/word/sabr');
    await expect(page.getByTestId('help-button')).toBeVisible();
    await expect(fsButton(page)).toHaveCount(0);
    await page.keyboard.press('f');
    expect(await inFullscreen(page)).toBe(false);
  });
});

test.describe('installable app', () => {
  test('the manifest and its icons are served, and every page links them', async ({ page, request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({ start_url: '/', display: 'fullscreen', short_name: 'Durar' });
    expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`)).toEqual(
      expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']),
    );
    for (const src of [...manifest.icons.map((i: { src: string }) => i.src), '/icons/apple-touch-icon.png']) {
      const icon = await request.get(src);
      expect(icon.headers()['content-type'], src).toBe('image/png');
    }
    for (const path of ['/', '/word/sabr']) {
      await page.goto(path);
      await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/manifest.webmanifest');
      await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
      await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', '#041621');
    }
  });

  test('iPhone Safari shows the Home Screen tip once; it can be dismissed and doesn’t come back', async ({ page }) => {
    await asIPhone(page);
    await page.goto('/word/sabr');
    const hint = page.getByTestId('install-hint');
    await expect(hint).toContainText('Tip: add Durar to your Home Screen for full screen.');
    const { violations } = await axe(page);
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
    await page.getByRole('button', { name: 'Dismiss tip' }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('html-card')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(hint).toHaveCount(0);
  });

  test('the tip waits for a second visit, so it never covers the first “How it works”', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await asIPhone(page);
    await page.goto('/');
    await expect(page.getByTestId('help-box')).toBeVisible();
    await expect(page.getByTestId('install-hint')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('install-hint')).toBeVisible();
    await context.close();
  });

  test('never inside the installed app, nor on browsers that have the fullscreen button', async ({ page }) => {
    await asIPhone(page, { installed: true });
    await page.goto('/word/sabr');
    await expect(page.getByTestId('html-card')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('install-hint')).toHaveCount(0);
    const stored = await page.evaluate(() => localStorage.getItem('durar-install-hint-seen'));
    expect(stored).toBeNull();
  });
});
