import illustrations from '../src/data/illustrations.json' with { type: 'json' };
import topics from '../src/data/topics.json' with { type: 'json' };
import words from '../src/data/words.json' with { type: 'json' };
import { creditLine } from '../shared/credits';
import type { Illustration } from '../shared/images';
import { expect, test } from './accounts';
import { routeIllustrations, waitForScene } from './helpers';

const USED = (illustrations as Illustration[]).filter(
  (e) => words.some((w) => (w as { image?: string }).image === e.id) || topics.some((t) => (t as { cover?: string }).cover === e.id),
);

test.describe('Credits', () => {
  test('the registry, the pipeline and the Credits copy stay out of the first-paint JS', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const entry = html.match(/<script type="module" crossorigin src="([^"]+)"/)![1];
    const js = await (await request.get(entry)).text();
    for (const s of ['commons.wikimedia.org', 'lanczos3', 'SIL Open Font License']) expect(js, s).not.toContain(s);
  });

  test('is prerendered with its own title and description, indexable and in the sitemap', async ({ request }) => {
    const res = await request.get('/credits');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<title>Credits · Durar</title>');
    expect(html).toContain('Who made the pictures and fonts on Durar');
    expect(html).not.toContain('noindex');
    const xml = await (await request.get('/sitemap.xml')).text();
    expect(xml).toContain('/credits</loc>');
    const origin = new URL(xml.match(/<loc>(.*?)<\/loc>/)![1]).origin;
    expect(html).toContain(`<link rel="canonical" href="${origin}/credits" />`);
  });

  test('credits every illustration in use, with its thumbnail and the words it is drawn for', async ({ page }) => {
    const seen = await routeIllustrations(page);
    await page.goto('/credits');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Credits');
    await expect(page).toHaveTitle('Credits · Durar');
    const items = page.locator('.credits-list > li');
    await expect(items).toHaveCount(USED.length);

    for (const e of USED) {
      const item = page.locator(`#ill-${e.id}`);
      const line = creditLine(e);
      expect((await item.locator('.credit-by').textContent())!.slice(0, line.length)).toBe(line);
      const img = item.locator('img');
      await expect(img).toHaveAttribute('alt', e.alt);
      await expect(img).toHaveAttribute('loading', 'lazy');
      await expect(img).toHaveAttribute('decoding', 'async');
      await expect(img).toHaveAttribute('crossorigin', 'anonymous');
      await expect(img).toHaveAttribute('width', '96');
      await expect(img).toHaveAttribute('src', new RegExp(`^https://img\\.durar\\.space/illustrations/${e.id}-[0-9a-f]{14}-320\\.webp$`));
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
      for (const w of words.filter((x) => (x as { image?: string }).image === e.id)) {
        // By address: one translit can sit inside another's (al jawzāʾ, yad al jawzāʾ).
        const link = item.locator(`a[href="/word/${w.slug}"]`);
        await expect(link).toHaveCount(1);
        await expect(link).toContainText(w.translit);
        await expect(link.locator('[lang=ar][dir=rtl]')).toHaveText(w.ar);
      }
    }
    // The thumbnails were fetched in CORS mode, so the same files can be drawn into canvases.
    expect(seen.length).toBeGreaterThan(0);
    for (const r of seen) expect(r.origin, r.url).toBeTruthy();
  });

  test('a headword opens its word, and Back returns to the Credits', async ({ page }) => {
    await routeIllustrations(page);
    const e = USED[0];
    const w = words.find((x) => (x as { image?: string }).image === e.id)!;
    await page.goto('/credits');
    await page.locator(`#ill-${e.id}`).getByRole('link', { name: new RegExp(w.translit) }).click();
    await expect(page).toHaveURL(new RegExp(`/word/${w.slug}$`));
    await waitForScene(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/credits$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Credits');
  });

  test('a host without the CORS header shows no thumbnail rather than a tainted one', async ({ page }) => {
    await routeIllustrations(page, { cors: false });
    await page.goto('/credits');
    const img = page.locator('.credit-thumb').first();
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 0)).toBe(true);
  });

  test('a link to one illustration scrolls to it', async ({ page }) => {
    await routeIllustrations(page);
    await page.setViewportSize({ width: 1440, height: 320 });
    await page.goto(`/credits#ill-${USED[0].id}`);
    await expect(page.locator(`#ill-${USED[0].id}`)).toBeInViewport();
  });

  test('ships the font licences it links to', async ({ page, request }) => {
    await page.goto('/credits');
    const links = page.getByRole('link', { name: / licence$/ });
    await expect(links).toHaveCount(4);
    for (const href of await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')!))) {
      const res = await request.get(href);
      expect(res.status(), href).toBe(200);
      expect(await res.text(), href).toContain('SIL Open Font License');
    }
  });

  test('is linked from Privacy and from “What is Durar?”', async ({ page }) => {
    await routeIllustrations(page);
    await page.goto('/privacy');
    await page.getByRole('link', { name: 'Credits' }).click();
    await expect(page).toHaveURL(/\/credits$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Credits');

    await page.goto('/');
    await waitForScene(page);
    await page.getByRole('button', { name: 'How it works' }).click();
    await page.getByRole('button', { name: 'What is Durar?' }).click();
    const about = page.getByRole('dialog', { name: 'What is Durar?' });
    await about.getByRole('link', { name: 'Credits' }).click();
    await expect(page).toHaveURL(/\/credits$/);
    await expect(about).toBeHidden();
    // The dialog and its link are gone, so focus starts at the new page's heading rather than <body>.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Credits');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });
});
