import { expect, test, type Page } from '@playwright/test';
import { trackErrors, waitForScene } from './helpers';
import { canonicalUrl, expectSigned, plain, pngDescription, word } from './share-helpers';

type Mode = { files?: boolean; cancel?: boolean; noShare?: boolean };
interface Recorded {
  title?: string;
  text?: string;
  url?: string;
  files: { name: string; type: string; b64: string }[];
  inTap: boolean;
}

/**
 * A stand-in for the phone's share sheet: records what it was given and whether it was called
 * straight from the tap (iOS refuses otherwise).
 */
async function mockShareSheet(page: Page, mode: Mode = {}) {
  await page.addInitScript((mode: Mode) => {
    const w = window as unknown as { __shares: unknown[]; __tap: boolean };
    w.__shares = [];
    w.__tap = false;
    window.addEventListener(
      'click',
      () => {
        w.__tap = true;
        setTimeout(() => (w.__tap = false), 0);
      },
      true,
    );
    if (mode.noShare) return;
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        const inTap = w.__tap;
        const files = await Promise.all(
          (data.files ?? []).map(async (f) => {
            const b = new Uint8Array(await f.arrayBuffer());
            let s = '';
            for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
            return { name: f.name, type: f.type, b64: btoa(s) };
          }),
        );
        w.__shares.push({ title: data.title, text: data.text, url: data.url, files, inTap });
        if (mode.cancel) throw new DOMException('Share canceled', 'AbortError');
      },
    });
    Object.defineProperty(Navigator.prototype, 'canShare', {
      configurable: true,
      value: (data: ShareData) => !data?.files || mode.files !== false,
    });
  }, mode);
}

const shares = (page: Page) => page.evaluate(() => (window as unknown as { __shares: Recorded[] }).__shares);

async function openWord(page: Page, slug: string) {
  await page.goto(`/word/${slug}`);
  await waitForScene(page);
  const share = page.getByTestId('share-button');
  await expect(share).toBeVisible();
  // The image is drawn while the phone is idle, before any tap (slow under CI's software rendering).
  await expect(share).toHaveAttribute('data-ready', slug, { timeout: 30_000 });
  return share;
}

test('one Share icon, on the focused card only', async ({ page }) => {
  await mockShareSheet(page);
  await openWord(page, 'nur');
  await expect(page.getByTestId('share-button')).toHaveCount(1);
  await expect(page.locator('.save-anchor [data-testid=share-button]')).toHaveCount(1);
  // A phone's Share opens the system sheet, not a menu.
  await expect(page.getByTestId('share-button')).not.toHaveAttribute('aria-haspopup', 'menu');
});

test('Share opens the share sheet from the tap with the signed 1080×1920 PNG, the link and the text', async ({ page }) => {
  const errors = trackErrors(page);
  await mockShareSheet(page);
  const share = await openWord(page, 'nur');
  await share.tap();
  await expect.poll(async () => (await shares(page)).length).toBe(1);
  const [call] = await shares(page);
  const w = word('nur');

  expect(call.inTap).toBe(true);
  expect(call.url).toBe(await canonicalUrl(page, 'nur'));
  expect(call.url).not.toContain('?');
  expect(plain(call.text!)).toBe(`${w.ar} (${w.translit}) — ${w.meanings[0]} · a pearl from Durar`);
  expect(call.files).toHaveLength(1);
  expect(call.files[0].name).toBe('durar-nur.png');
  expect(call.files[0].type).toBe('image/png');

  const png = Buffer.from(call.files[0].b64, 'base64');
  await expectSigned(png);
  expect(pngDescription(png)).toBe(`${w.ar} (${w.translit}): ${w.meanings[0]}`);
  await expect(page.getByTestId('share-note')).toBeEmpty();
  expect(errors).toEqual([]);
});

test('without file sharing, Share sends the link and text only', async ({ page }) => {
  await mockShareSheet(page, { files: false });
  await page.goto('/word/najm');
  await waitForScene(page);
  await page.getByTestId('share-button').tap();
  await expect.poll(async () => (await shares(page)).length).toBe(1);
  const [call] = await shares(page);
  expect(call.files).toEqual([]);
  expect(call.url).toBe(await canonicalUrl(page, 'najm'));
  expect(plain(call.text!)).toContain(`${word('najm').ar} (${word('najm').translit})`);
});

test('cancelling the share sheet does nothing: no error, no message', async ({ page }) => {
  const errors = trackErrors(page);
  await mockShareSheet(page, { cancel: true });
  const share = await openWord(page, 'nur');
  await share.tap();
  await expect.poll(async () => (await shares(page)).length).toBe(1);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('share-note')).toBeEmpty();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(share).not.toHaveAttribute('aria-busy', 'true');
  expect(errors).toEqual([]);
});

test('with no share sheet at all, Share opens the menu', async ({ page }) => {
  await mockShareSheet(page, { noShare: true });
  await page.goto('/word/nur');
  await waitForScene(page);
  await page.getByTestId('share-button').tap();
  const menu = page.getByRole('menu', { name: `Share ${word('nur').ar}` });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText(['WhatsApp', 'Copy link', 'Download image']);
});

test('text-only view: the same Share on the card', async ({ page }) => {
  await mockShareSheet(page);
  await page.goto('/word/nur');
  await waitForScene(page);
  await page.getByTestId('mode-toggle').tap();
  const card = page.getByTestId('html-card');
  await expect(card.getByTestId('share-button')).toHaveCount(1);
  await expect(page.getByTestId('share-button')).toHaveCount(1);
  await card.getByTestId('share-button').tap();
  await expect.poll(async () => (await shares(page)).length).toBe(1);
  const [call] = await shares(page);
  expect(call.files[0].name).toBe('durar-nur.png');
  await expectSigned(Buffer.from(call.files[0].b64, 'base64'));
});
