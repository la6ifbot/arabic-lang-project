import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import words from '../src/data/words.json' with { type: 'json' };
import topics from '../src/data/topics.json' with { type: 'json' };
import { expect, seed, test } from './accounts';
import { focused, focusedSlug, today, waitForScene } from './helpers';

const inTopic = (id: string) => new Set(words.filter((w) => w.topics.includes(id)).map((w) => w.slug));
const topicName = (id: string) => topics.find((t) => t.id === id)!.name.en;
const picker = (page: Page) => page.getByTestId('topic-picker').getByRole('button', { name: /Part of the sea/ });

async function choose(page: Page, id: string | null) {
  await picker(page).click();
  await page.getByRole('menuitemradio', { name: id ? topicName(id) : 'The whole sea' }).click();
}

test.describe('topic picker', () => {
  test('choosing a topic with the mouse: the address, the title and every card follow it', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await expect(picker(page)).toContainText('The whole sea');
    await choose(page, 'sky');
    await expect(page).toHaveURL(/\/sea\/sky$/);
    await expect(picker(page)).toContainText('Sky & stars');
    await expect(page).toHaveTitle(/· Sky & stars · Durar$/);
    const sky = inTopic('sky');
    for (let i = 0; i < 6; i++) {
      expect(sky.has(await focusedSlug(page)), `card ${i} is in Sky & stars`).toBe(true);
      const before = await focusedSlug(page);
      await page.keyboard.press('ArrowRight');
      await expect(focused(page)).not.toHaveAttribute('data-slug', before);
    }
    // The address stays on the topic while swiping.
    await expect(page).toHaveURL(/\/sea\/sky$/);
  });

  test('keyboard: arrows, Home/End, Enter, Escape; left/right never swipe the card', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const start = await focusedSlug(page);
    await picker(page).focus();
    await page.keyboard.press('ArrowDown');
    const items = page.getByRole('menuitemradio');
    await expect(items.first()).toBeFocused();
    await expect(items.first()).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(focused(page)).toHaveAttribute('data-slug', start);
    await page.keyboard.press('End');
    await expect(items.last()).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowUp');
    await expect(items.last()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(picker(page)).toBeFocused();

    // Enter opens on the current choice; one step down is Sea & water.
    await page.keyboard.press('Enter');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/sea\/water$/);
    await expect(picker(page)).toBeFocused();
    expect(inTopic('water').has(await focusedSlug(page))).toBe(true);
  });

  test('reduced motion: switching still works (the cards fade instead of sinking and rising)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await waitForScene(page);
    await choose(page, 'desert');
    await expect(page).toHaveURL(/\/sea\/desert$/);
    expect(inTopic('desert').has(await focusedSlug(page))).toBe(true);
  });

  test('back and forward move between topics', async ({ page }) => {
    await page.goto('/word/durrah');
    await waitForScene(page);
    await choose(page, 'feeling');
    await expect(page).toHaveURL(/\/sea\/feeling$/);
    await choose(page, 'poetry');
    await expect(page).toHaveURL(/\/sea\/poetry$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/sea\/feeling$/);
    await expect(picker(page)).toContainText('Feeling & virtue');
    expect(inTopic('feeling').has(await focusedSlug(page))).toBe(true);
    await page.goBack();
    await expect(picker(page)).toContainText('The whole sea');
    await expect(page).toHaveURL(/\/word\/[a-z-]+$/);
    await page.goForward();
    await expect(picker(page)).toContainText('Feeling & virtue');
  });

  test('the choice is remembered: / reopens it with Pearl of the Day first; a shared word opens the whole sea', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await choose(page, 'flowers');
    await expect(page).toHaveURL(/\/sea\/flowers$/);
    await page.goto('/');
    await waitForScene(page);
    await expect(picker(page)).toContainText('Flowers & scent');
    await expect(focused(page)).toHaveAttribute('data-slug', today().slug);
    await expect(page).toHaveURL(/\/sea\/flowers$/);
    await page.goto('/word/najm');
    await waitForScene(page);
    await expect(picker(page)).toContainText('The whole sea');
    await expect(focused(page)).toHaveAttribute('data-slug', 'najm');
    // Choosing the whole sea forgets the topic.
    await page.goto('/sea/flowers');
    await waitForScene(page);
    await choose(page, null);
    await page.goto('/');
    await waitForScene(page);
    await expect(picker(page)).toContainText('The whole sea');
  });

  test('signed in, the choice is saved to the account and follows it to another browser', async ({ page, browser }) => {
    test.setTimeout(90_000);
    await seed(page, { signedIn: true });
    await page.goto('/');
    await waitForScene(page);
    await choose(page, 'sky');
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('durar-mock-db')!).users[0].topic))
      .toBe('sky');
    const db = await page.evaluate(() => localStorage.getItem('durar-mock-db')!);

    // Another device: same account, nothing remembered in this browser yet.
    const other = await browser.newContext({ baseURL: 'http://localhost:4173' });
    const page2 = await other.newPage();
    await page2.addInitScript((value) => {
      (window as unknown as { __DURAR_MOCK__: boolean }).__DURAR_MOCK__ = true;
      localStorage.setItem('durar-help-seen', '1');
      if (!localStorage.getItem('durar-mock-db')) localStorage.setItem('durar-mock-db', value);
      // No 3D here: the account loads after the scene is up, and a second software-WebGL scene on a
      // busy CI machine can take longer than the test. The text view loads the account straight away.
      delete (window as unknown as { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext;
    }, db);
    await page2.goto('/');
    await expect.poll(() => page2.evaluate(() => localStorage.getItem('durar-topic')), { timeout: 20_000 }).toBe('sky');
    await page2.goto('/');
    await expect(picker(page2)).toContainText('Sky & stars');
    await other.close();
  });

  test('a topic with nothing new or due offers the whole sea', async ({ page }) => {
    const now = Date.now();
    const desert = [...inTopic('desert')];
    await page.addInitScript(
      ({ slugs, at }) => {
        const iso = (t: number) => new Date(t).toISOString();
        const items = slugs.map((slug) => ({ slug, box: 3, dueAt: iso(at + 9 * 86_400_000), lastReviewedAt: iso(at - 3_600_000), timesSeen: 3, lapses: 0 }));
        if (!localStorage.getItem('durar-progress')) localStorage.setItem('durar-progress', JSON.stringify({ v: 1, seed: 'test', items }));
      },
      { slugs: desert, at: now },
    );
    await page.goto('/sea/desert');
    await waitForScene(page);
    await expect(page.getByTestId('met-all')).toContainText('Nothing new or due in Desert');
    await page.getByRole('button', { name: 'Swim in the whole sea' }).click();
    await expect(picker(page)).toContainText('The whole sea');
    await expect(page.getByTestId('met-all')).toHaveCount(0);
  });

  test('works in the text-only view', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await page.getByTestId('mode-toggle').click();
    await choose(page, 'poetry');
    const slug = await page.getByTestId('focused-word').getAttribute('data-slug');
    expect(inTopic('poetry').has(slug!)).toBe(true);
    await expect(page.getByTestId('html-card').locator('[lang=ar]').first()).toBeVisible();
  });

  test('axe: the open picker is clean', async ({ page }) => {
    await page.goto('/sea/sky');
    await waitForScene(page);
    await picker(page).click();
    await expect(page.getByRole('menu')).toBeVisible();
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('[data-testid=scene]')
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });
});

test.describe('topic pages', () => {
  test('a live visit opens the sea on that topic', async ({ page }) => {
    await page.goto('/sea/desert');
    await waitForScene(page);
    await expect(picker(page)).toContainText('Desert');
    expect(inTopic('desert').has(await focusedSlug(page))).toBe(true);
  });

  test('each topic page is prerendered with unique meta, both languages and its word list', async ({ request }) => {
    const titles = new Set<string>();
    for (const t of topics.filter((x) => inTopic(x.id).size > 0)) {
      const html = await (await request.get(`/sea/${t.id}`)).text();
      const title = html.match(/<title>([^<]*)<\/title>/)![1];
      titles.add(title);
      expect(title).toContain(t.name.en.replace('&', '&amp;'));
      expect(html).toContain(`<link rel="canonical" href="https://durar.example/sea/${t.id}" />`);
      expect(html).toContain(t.description.ar);
      for (const slug of inTopic(t.id)) expect(html).toContain(`href="/word/${slug}"`);
    }
    expect(titles.size).toBe(6);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const t of ['water', 'sky', 'flowers', 'desert', 'feeling', 'poetry']) expect(sitemap).toContain(`/sea/${t}</loc>`);
    // An empty topic has no page yet.
    expect(sitemap).not.toContain('/sea/borrowed');
  });

  test('word pages link to their topics', async ({ request }) => {
    const html = await (await request.get('/word/najm')).text();
    expect(html).toContain('<a href="/sea/sky">Sky &amp; stars');
  });
});
