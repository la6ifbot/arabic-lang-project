import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { focusedSlug, today, trackErrors } from './helpers';
import { canonicalUrl, expectSigned, plain, pngDescription, signatureCrop, thumb, word } from './share-helpers';

const shareButton = (page: Page) => page.getByTestId('share-button');
const shareMenu = (page: Page, slug: string) => page.getByRole('menu', { name: `Share ${word(slug).ar}` });

/** Opens a word in the sea and waits for its card controls to settle. */
async function openWord(page: Page, slug: string) {
  await page.goto(`/word/${slug}`);
  await expect(page.locator('[data-testid=scene] canvas')).toBeVisible();
  // Software WebGL on a busy CI runner can take a while to settle the first frame.
  await expect(page.locator('.save-anchor')).toHaveAttribute('data-visible', 'true', { timeout: 40_000 });
}

async function downloadStory(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('share-download').click()]);
  return { name: download.suggestedFilename(), png: readFileSync((await download.path())!) };
}

test('Share sits on the focused card only, and needs no account', async ({ page }) => {
  await openWord(page, 'nur');
  await expect(shareButton(page)).toHaveCount(1);
  await expect(page.locator('.save-anchor').getByTestId('share-button')).toBeVisible();
  await expect(shareButton(page)).toHaveAttribute('title', 'Share');
  await expect(shareButton(page)).toHaveAccessibleName(`Share ${word('nur').ar}`);
});

test('Share and the save pearl sit side by side without crowding', async ({ page }) => {
  await page.addInitScript(() => ((window as unknown as { __DURAR_MOCK__: boolean }).__DURAR_MOCK__ = true));
  await openWord(page, 'nur');
  const share = (await shareButton(page).boundingBox())!;
  const save = (await page.getByTestId('save-button').boundingBox())!;
  expect(Math.abs(share.y - save.y)).toBeLessThan(1);
  expect(share.x + share.width).toBeLessThanOrEqual(save.x);
  expect(Math.min(share.width, share.height, save.width, save.height)).toBeGreaterThanOrEqual(44);
});

test('Share is reachable by Tab, and its menu works by keyboard', async ({ page }) => {
  await openWord(page, 'nur');
  const share = shareButton(page);
  for (let i = 0; i < 12 && !(await share.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(share).toBeFocused();
  await expect(share).toHaveAttribute('aria-haspopup', 'menu');
  await expect(share).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('Enter');
  const menu = shareMenu(page, 'nur');
  await expect(menu).toBeVisible();
  await expect(share).toHaveAttribute('aria-expanded', 'true');
  const items = menu.getByRole('menuitem');
  await expect(items).toHaveText(['WhatsApp', 'Copy link', 'Download image']);
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.nth(2)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(items.nth(2)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.nth(0)).toBeFocused();

  // The page's own keys stay out of the menu: arrows don't swipe the card away.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  expect(await focusedSlug(page)).toBe('nur');

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(share).toBeFocused();
  await expect(share).toHaveAttribute('aria-expanded', 'false');

  // Space opens it too; a click outside closes it.
  await page.keyboard.press(' ');
  await expect(menu).toBeVisible();
  await page.mouse.click(40, 450);
  await expect(menu).toHaveCount(0);
});

test('WhatsApp opens with the prefilled text and canonical link, correctly encoded', async ({ page }) => {
  await openWord(page, 'nur');
  await shareButton(page).click();
  const link = page.getByTestId('share-whatsapp');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const href = new URL((await link.getAttribute('href'))!);
  expect(href.origin + href.pathname).toBe('https://wa.me/');
  expect([...href.searchParams.keys()]).toEqual(['text']);
  const w = word('nur');
  const url = await canonicalUrl(page, 'nur');
  expect(plain(href.searchParams.get('text')!)).toBe(`${w.ar} (${w.translit}) — ${w.meanings[0]} · a pearl from Durar\n${url}`);
  expect(url).not.toContain('?');
});

test('today’s pearl is shared as “Today’s pearl”', async ({ page }) => {
  const w = today();
  await page.goto('/');
  await expect(page.locator('.save-anchor')).toHaveAttribute('data-visible', 'true', { timeout: 20_000 });
  expect(await focusedSlug(page)).toBe(w.slug);
  await shareButton(page).click();
  const text = new URL((await page.getByTestId('share-whatsapp').getAttribute('href'))!).searchParams.get('text')!;
  expect(plain(text)).toBe(`دُرَّةُ اليَوْم · Today’s pearl: ${w.ar} (${w.translit}) — ${w.meanings[0]}\n${await canonicalUrl(page, w.slug)}`);
});

test('Copy link copies the canonical URL and says so quietly', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openWord(page, 'najm');
  await shareButton(page).click();
  await page.getByTestId('share-copy').click();
  await expect(page.getByTestId('share-note')).toHaveText('Link copied');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(shareButton(page)).toBeFocused();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await canonicalUrl(page, 'najm'));
  await expect(page.getByTestId('share-note')).toBeEmpty({ timeout: 5_000 });
});

test('Download image saves durar-<slug>.png, signed and described', async ({ page }) => {
  const errors = trackErrors(page);
  await openWord(page, 'nur');
  await shareButton(page).click();
  const { name, png } = await downloadStory(page);
  expect(name).toBe('durar-nur.png');
  await expectSigned(png);
  const w = word('nur');
  expect(pngDescription(png)).toBe(`${w.ar} (${w.translit}): ${w.meanings[0]}`);
  await expect(shareButton(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test('story images: short word, long headword, several meanings, long example', async ({ page }) => {
  // Four full page loads and four story renders, under software WebGL.
  test.setTimeout(300_000);
  // A short word, the longest headword, the most meaning text with two meanings, the longest example.
  const crops: Buffer[] = [];
  for (const slug of ['nur', 'tumaninah', 'durrah', 'azal']) {
    await openWord(page, slug);
    await shareButton(page).click();
    const { name, png } = await downloadStory(page);
    expect(name).toBe(`durar-${slug}.png`);
    await expectSigned(png);
    expect(await thumb(png)).toMatchSnapshot(`story-${slug}.png`, { maxDiffPixelRatio: 0.02 });
    crops.push(await sharp(await signatureCrop(png)).raw().toBuffer());
  }
  // The signature is the same on every image: the word's text never reaches it.
  for (const c of crops.slice(1)) expect(c.equals(crops[0])).toBe(true);
});

test('axe: no violations with the share menu open', async ({ page }) => {
  await openWord(page, 'hanin');
  await shareButton(page).click();
  await expect(shareMenu(page, 'hanin')).toBeVisible();
  // Let the menu finish rising in before measuring contrast.
  await page.waitForTimeout(600);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('[data-testid=scene]')
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
});

test('text-only view: the same Share, menu and signed download', async ({ page }) => {
  await openWord(page, 'sarab');
  await page.getByTestId('mode-toggle').click();
  const card = page.getByTestId('html-card');
  await expect(card.getByTestId('share-button')).toBeVisible();
  await expect(shareButton(page)).toHaveCount(1);

  await card.getByTestId('share-button').focus();
  await page.keyboard.press('Enter');
  const menu = shareMenu(page, 'sarab');
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(card.getByTestId('share-button')).toBeFocused();

  await card.getByTestId('share-button').click();
  const { name, png } = await downloadStory(page);
  expect(name).toBe('durar-sarab.png');
  await expectSigned(png);

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
});
