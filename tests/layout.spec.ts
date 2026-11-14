import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';

/**
 * The main screen's layout on the phones, tablets and computers people use, at the phone text sizes
 * people set, in both orientations. On each it checks that the card is centred with even margins,
 * that its button row sits just below it (never over its text), and that no control touches the card
 * or another control, then attaches a screenshot of the state to the test report. Emulated in
 * Chromium (a real iPhone's Safari and Samsung Internet aren't available to CI): viewport, density,
 * user agent and touch; text sizes are the root font size (as Android's font scaling does).
 */

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';
const SAMSUNG =
  'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const PIXEL = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';

interface Device {
  name: string;
  width: number;
  height: number;
  ua?: string;
  phone: boolean;
  touch: boolean;
}

export const DEVICES: Device[] = [
  { name: 'iPhone 17 Pro (Safari)', width: 402, height: 874, ua: IOS, phone: true, touch: true },
  { name: 'small iPhone, 375 px (Safari)', width: 375, height: 667, ua: IOS, phone: true, touch: true },
  { name: 'Galaxy S25 Ultra (Samsung Internet)', width: 412, height: 891, ua: SAMSUNG, phone: true, touch: true },
  { name: 'Galaxy S25 Ultra (Chrome)', width: 412, height: 891, ua: CHROME_ANDROID, phone: true, touch: true },
  { name: 'Pixel (Chrome)', width: 412, height: 915, ua: PIXEL, phone: true, touch: true },
  { name: 'iPad (Safari)', width: 820, height: 1180, ua: IPAD, phone: false, touch: true },
  { name: 'desktop', width: 1440, height: 900, phone: false, touch: false },
];

/** Phone text sizes (Settings › Display › Font size), as a share of the default. */
export const TEXT_SIZES = [100, 130, 150, 200];

type Box = { left: number; top: number; right: number; bottom: number };

const overlaps = (a: Box, b: Box, slack = 1) =>
  a.left < b.right - slack && b.left < a.right - slack && a.top < b.bottom - slack && b.top < a.bottom - slack;

/** Waits until the focused card has settled (its box unchanged for a moment), then returns it. */
async function settledCard(page: Page): Promise<Box> {
  const anchor = page.locator('.save-anchor');
  await expect(anchor).toHaveAttribute('data-visible', 'true', { timeout: 40_000 });
  let last = '';
  let same = 0;
  for (let i = 0; i < 80 && same < 4; i++) {
    await page.waitForTimeout(250);
    const now = (await anchor.getAttribute('data-card')) ?? '';
    // Within a pixel counts as still: the card sways gently in the water.
    const close = last && now.split(',').every((v, k) => Math.abs(Number(v) - Number(last.split(',')[k])) <= 1);
    same = close ? same + 1 : 0;
    last = now;
  }
  const [left, top, right, bottom] = last.split(',').map(Number);
  return { left, top, right, bottom };
}

async function boxes(page: Page) {
  return page.evaluate(() => {
    const out: Record<string, { left: number; top: number; right: number; bottom: number }> = {};
    const add = (name: string, sel: string) => {
      document.querySelectorAll<HTMLElement>(sel).forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') out[i ? `${name} ${i}` : name] = r.toJSON();
      });
    };
    add('brand and account corner', '.corner-left');
    add('search', '.search input');
    add('topic picker', '.topics-button');
    add('Pearl of the Day', '.potd');
    add('swipe controls', '.controls');
    add('view toggles', '.view-toggles');
    add('card buttons', '.save-anchor .card-actions');
    return out;
  });
}

/** Everything the layout promises, for the state the page is in now. */
async function checkLayout(page: Page, info: TestInfo, label: string, phone: boolean) {
  const card = await settledCard(page);
  const { width, height } = page.viewportSize()!;
  const b = await boxes(page);
  const row = b['card buttons'];
  const at = `${label}: `;

  // Centred, with even margins, and on screen.
  expect(Math.abs(card.left - (width - card.right)), `${at}card centred (left ${card.left}, right ${width - card.right})`).toBeLessThanOrEqual(5);
  expect(card.left, `${at}card on screen`).toBeGreaterThanOrEqual(0);
  expect(card.top, `${at}card on screen`).toBeGreaterThanOrEqual(0);

  // The button row: just below the card, centred under it (within the card's gentle sway, as for
  // centring), never over it, on screen.
  expect(row, `${at}card buttons showing`).toBeTruthy();
  expect(row.top, `${at}buttons below the card`).toBeGreaterThanOrEqual(card.bottom - 1);
  expect(row.top - card.bottom, `${at}buttons right below the card`).toBeLessThanOrEqual(16);
  expect(Math.abs((row.left + row.right) / 2 - (card.left + card.right) / 2), `${at}buttons centred under the card`).toBeLessThanOrEqual(5);
  expect(row.left >= 0 && row.right <= width && row.bottom <= height, `${at}buttons on screen`).toBe(true);
  if (phone) {
    // Listen, Letters, Share, Save (the sentence and 0.75× join Listen only after a first play).
    const buttons = page.locator('.save-anchor .card-actions button:visible');
    expect(await buttons.count(), `${at}four buttons under the card`).toBeLessThanOrEqual(4);
  }
  if (phone || width < 1024) await expect(page.locator('.view-toggles')).toBeHidden();
  for (const [name, box] of Object.entries(b)) {
    if (name !== 'card buttons') expect(overlaps(card, box), `${at}${name} clear of the card`).toBe(false);
  }
  const names = Object.keys(b);
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) expect(overlaps(b[names[i]], b[names[j]]), `${at}${names[i]} clear of ${names[j]}`).toBe(false);

  // Nothing scrolls sideways.
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth), `${at}no sideways scroll`).toBeLessThanOrEqual(0);

  await info.attach(`${label}.png`, { body: await page.screenshot(), contentType: 'image/png' });
}

const setTextSize = (page: Page, percent: number) =>
  page.evaluate((p) => {
    document.documentElement.style.fontSize = p === 100 ? '' : `${p}%`;
  }, percent);

async function openSea(page: Page) {
  // Signed in (mock accounts), so the save pearl shows as it does for most visitors.
  await page.addInitScript(() => {
    (window as unknown as { __DURAR_MOCK__: boolean }).__DURAR_MOCK__ = true;
    localStorage.setItem('durar-install-hint-seen', '1');
  });
  await page.goto('/word/misk');
  await expect(page.locator('[data-testid=scene] canvas')).toBeVisible();
}

for (const d of DEVICES) {
  test.describe(d.name, () => {
    test.use({
      viewport: { width: d.width, height: d.height },
      // Density 1 keeps software rendering fast on CI; the sharp-text test below uses 3.
      deviceScaleFactor: 1,
      isMobile: d.touch,
      hasTouch: d.touch,
      ...(d.ua ? { userAgent: d.ua } : {}),
    });

    test('card centred, buttons below it, nothing overlapping: every text size, both orientations', async ({ page }, info) => {
      test.setTimeout(240_000);
      await openSea(page);
      const sizes = d.phone ? TEXT_SIZES : [100];
      for (const size of sizes) {
        await setTextSize(page, size);
        await checkLayout(page, info, `portrait, text ${size}%`, d.phone);
      }
      await setTextSize(page, 100);
      if (d.touch) {
        // Turned on its side, then back: the card and its buttons follow.
        await page.setViewportSize({ width: d.height, height: d.width });
        await checkLayout(page, info, 'landscape, text 100%', d.phone);
        if (d.phone) {
          await setTextSize(page, 200);
          await checkLayout(page, info, 'landscape, text 200%', d.phone);
          await setTextSize(page, 100);
        }
        await page.setViewportSize({ width: d.width, height: d.height });
        await checkLayout(page, info, 'portrait again', d.phone);
      }
      if (d.phone) {
        // The browser's bars showing (a shorter screen) and hiding again.
        await page.setViewportSize({ width: d.width, height: d.height - 80 });
        await checkLayout(page, info, 'browser bars showing', d.phone);
        await page.setViewportSize({ width: d.width, height: d.height });
        await checkLayout(page, info, 'browser bars hidden', d.phone);
      }
    });
  });
}

test.describe('phone menus and buttons', () => {
  test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: IOS });

  test('Text-only view, Slow voice and Daily email are in the “?” menu; axe finds nothing', async ({ page }) => {
    await openSea(page);
    await settledCard(page);
    await expect(page.getByTestId('mode-toggle')).toBeHidden();
    await expect(page.getByTestId('subscribe-open')).toBeHidden();
    await page.getByTestId('help-button').tap();
    const settings = page.getByRole('group', { name: 'Settings' });
    await expect(settings.getByRole('button', { name: 'Text-only view' })).toHaveAttribute('aria-pressed', 'false');
    await expect(settings.getByRole('button', { name: 'Slow voice' })).toHaveAttribute('aria-pressed', 'false');
    await expect(settings.getByRole('button', { name: 'Daily email' })).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);

    await settings.getByRole('button', { name: 'Slow voice' }).tap();
    await expect(settings.getByRole('button', { name: 'Slow voice' })).toHaveAttribute('aria-pressed', 'true');
    await settings.getByRole('button', { name: 'Daily email' }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('every card button has a name, and the save pearl is a pearl in outline', async ({ page }) => {
    await openSea(page);
    await settledCard(page);
    const row = page.locator('.save-anchor .card-actions');
    for (const b of await row.getByRole('button').all()) expect(await b.getAttribute('aria-label')).toBeTruthy();
    await expect(row.getByTestId('save-button')).toHaveAccessibleName('Save مِسْك to My Pearls');
    await expect(row.locator('.save-sheen')).toBeVisible();
    await expect(row.locator('.save-glint')).toHaveCSS('opacity', '0.7');
  });

  test('after the first play, Listen gains the sentence and a 0.75× switch', async ({ page }) => {
    await page.addInitScript(() => {
      // A silent stand-in for the audio element, so nothing is fetched.
      HTMLMediaElement.prototype.play = function () {
        this.dispatchEvent(new Event('playing'));
        return Promise.resolve();
      };
    });
    await openSea(page);
    await settledCard(page);
    const row = page.locator('.save-anchor .card-actions');
    await expect(row.getByTestId('speak-sentence')).toBeHidden();
    await expect(row.getByTestId('listen-rate')).toHaveCount(0);
    await row.getByTestId('speak-word').tap();
    await expect(row.getByTestId('listen-rate')).toBeVisible();
    await expect(row.getByTestId('speak-sentence')).toBeVisible();
    await row.getByTestId('listen-rate').tap();
    await expect(row.getByTestId('listen-rate')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('sharp text on a 3× phone', () => {
  test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IOS });

  test('the focused card’s text is drawn at 3×, over the card, while the scene stays at 2×', async ({ page }) => {
    await openSea(page);
    const card = await settledCard(page);
    const crisp = page.locator('.crisp-text');
    await expect(crisp).toHaveCSS('opacity', '1', { timeout: 20_000 });
    const { pixels, box, scene } = await crisp.evaluate((el: HTMLCanvasElement) => ({
      pixels: el.height,
      box: el.getBoundingClientRect().toJSON(),
      scene: document.querySelector<HTMLCanvasElement>('[data-testid=scene] canvas')!.width / window.innerWidth,
    }));
    // The 3D scene stays at 2× at most (lower if the phone is struggling).
    expect(scene).toBeLessThanOrEqual(2.01);
    // 3 device pixels per CSS pixel of the card's height on screen.
    expect(pixels / (card.bottom - card.top)).toBeGreaterThan(2.8);
    // Laid over the card's text band: same height, centred on it.
    expect(Math.abs(box.top - card.top)).toBeLessThanOrEqual(5);
    expect(Math.abs(box.bottom - card.bottom)).toBeLessThanOrEqual(5);
    expect(Math.abs((box.left + box.right) / 2 - (card.left + card.right) / 2)).toBeLessThanOrEqual(5);
  });
});

test.describe('forced dark mode (Samsung Internet, Chrome)', () => {
  test.use({ viewport: { width: 412, height: 891 }, isMobile: true, hasTouch: true, userAgent: SAMSUNG, colorScheme: 'dark' });

  test('the site declares itself dark, so a forced dark mode leaves its colours alone', async ({ page, playwright, baseURL }, info) => {
    await openSea(page);
    await expect(page.locator('meta[name=color-scheme]')).toHaveAttribute('content', 'dark');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');

    // The same page of the site (one without the moving sea, so screenshots compare exactly) in a
    // browser with forced dark mode off and on, as Samsung Internet's dark mode does.
    const launch = (test.info().project.use.launchOptions ?? {}) as { executablePath?: string; args?: string[] };
    const shoot = async (forceDark: boolean) => {
      const browser = await playwright.chromium.launch({
        executablePath: launch.executablePath,
        args: [...(launch.args ?? []), ...(forceDark ? ['--blink-settings=forceDarkModeEnabled=true'] : [])],
      });
      try {
        const ctx = await browser.newContext({ viewport: { width: 412, height: 891 }, isMobile: true, hasTouch: true, userAgent: SAMSUNG, colorScheme: 'dark' });
        const p = await ctx.newPage();
        // The setting really does recolour a page that doesn't declare itself dark.
        await p.setContent('<body style="margin:0;background:#fff"><p>light</p></body>');
        const { data } = await sharp(await p.screenshot({ clip: { x: 300, y: 600, width: 1, height: 1 } }))
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect(data[0] < 128, `a light page is ${forceDark ? '' : 'not '}darkened`).toBe(forceDark);
        await p.goto(new URL('/privacy', baseURL).href);
        await expect(p.locator('h1')).toBeVisible();
        await p.waitForTimeout(1500); // fonts and the page's fade-in
        return await p.screenshot({ animations: 'disabled' });
      } finally {
        await browser.close();
      }
    };
    const plain = await shoot(false);
    const forced = await shoot(true);
    await info.attach('privacy page, forced dark mode.png', { body: forced, contentType: 'image/png' });
    expect(forced.equals(plain), 'same pixels with forced dark mode on').toBe(true);
  });
});
