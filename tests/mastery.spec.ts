import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { dialog, expect, LAYLA, seed, signInViaDialog, status, test, waitForSea, type SeedProgress } from './accounts';
import { today } from './helpers';
import words from '../src/data/words.json' with { type: 'json' };

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-05T08:00:00Z');
const potd = today().slug;
/** Words that aren't today's pearl, in dataset order. */
const W = words.map((w) => w.slug).filter((s) => s !== potd);

const iso = (ms: number) => new Date(ms).toISOString();
function prog(slug: string, box: number, dueIn: number, now = Date.now()): SeedProgress {
  return { slug, box, dueAt: iso(now + dueIn), lastReviewedAt: iso(now - DAY), timesSeen: 1, lapses: 0 };
}

/** Signed-out progress, as the site keeps it in this browser. */
async function seedGuest(page: Page, items: SeedProgress[], seedValue = 'test-seed') {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('durar-progress')) localStorage.setItem('durar-progress', value);
  }, JSON.stringify({ v: 1, seed: seedValue, items }));
}

const focusedSlug = (page: Page) => page.getByTestId('focused-word').getAttribute('data-slug') as Promise<string>;
const progressStatus = (page: Page) => page.getByTestId('progress-status');
const ready = (page: Page) => expect(page.getByTestId('progress-note')).toHaveAttribute('data-progress', 'ready', { timeout: 20_000 });
const guestCopy = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('durar-progress') ?? 'null'));
const mockProgress = (page: Page, userId = LAYLA.id) =>
  page.evaluate((id) => JSON.parse(localStorage.getItem('durar-mock-db') ?? '{}').progress?.[id] ?? [], userId);
const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('[data-testid=scene]');
const noViolations = async (page: Page) => {
  const { violations } = await axe(page).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
};

async function swipe(page: Page, key: 'ArrowRight' | 'ArrowLeft') {
  const before = await focusedSlug(page);
  await page.keyboard.press(key);
  await expect(page.getByTestId('focused-word')).not.toHaveAttribute('data-slug', before);
}

test.describe('mastery: progress is saved', () => {
  test('signed out: a swipe is announced, kept in this browser and survives a reload', async ({ page }) => {
    await page.goto(`/word/${W[0]}`);
    await waitForSea(page);
    await ready(page);
    await swipe(page, 'ArrowRight');
    await expect(progressStatus(page)).toHaveText('Marked known · returns in 3 days');
    await expect(page.locator('.progress-caption')).toHaveText('Marked known · returns in 3 days');
    await swipe(page, 'ArrowLeft');
    await expect(progressStatus(page)).toHaveText('Still learning · back tomorrow');
    const copy = await guestCopy(page);
    expect(copy.items.map((p: SeedProgress) => [p.slug, p.box]).sort()).toHaveLength(2);

    await page.goto('/library');
    await expect(page.getByTestId('library-count')).toHaveText('1 in the deep · 1 still learning · 0 saved');
    const card = page.getByTestId('library-list').locator(`a[data-slug="${W[0]}"]`);
    await expect(card).toContainText('In the deep · 2 of 5');
    await expect(card).toContainText('returns in 3 days');
    await page.reload();
    await expect(page.getByTestId('library-count')).toHaveText('1 in the deep · 1 still learning · 0 saved');
  });

  test('signed in: progress is saved to the account and survives a reload', async ({ page }) => {
    await seed(page, { signedIn: true });
    await page.goto(`/word/${W[1]}`);
    await waitForSea(page);
    await ready(page);
    await swipe(page, 'ArrowRight');
    await expect.poll(async () => (await mockProgress(page)).map((p: SeedProgress) => [p.slug, p.box])).toEqual([[W[1], 2]]);
    expect(await guestCopy(page)).toBeNull();
    await page.reload();
    await waitForSea(page);
    await ready(page);
    await page.goto('/library');
    await expect(page.getByTestId('library-count')).toHaveText('1 in the deep · 0 still learning · 0 saved');
  });

  test('offline: saving retries quietly until the network is back', async ({ page }) => {
    await seed(page, { signedIn: true });
    await page.goto(`/word/${W[2]}`);
    await waitForSea(page);
    await ready(page);
    await page.evaluate(() => (window as unknown as { __durarMock: { failNext(op: string): void } }).__durarMock.failNext('saveProgress'));
    await swipe(page, 'ArrowLeft');
    await expect(progressStatus(page)).toHaveText('Still learning · back tomorrow');
    await expect.poll(async () => (await mockProgress(page)).map((p: SeedProgress) => p.slug), { timeout: 15_000 }).toEqual([W[2]]);
  });

  test('private mode (storage blocked) never breaks the site', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const blocked = () => {
        throw new DOMException('blocked', 'SecurityError');
      };
      Storage.prototype.getItem = blocked;
      Storage.prototype.setItem = blocked;
      Storage.prototype.removeItem = blocked;
    });
    await page.goto(`/word/${W[3]}`);
    await waitForSea(page);
    await ready(page);
    await swipe(page, 'ArrowRight');
    await expect(progressStatus(page)).toHaveText('Marked known · returns in 3 days');
    await swipe(page, 'ArrowLeft');
    expect(errors).toEqual([]);
  });
});

test.describe('mastery: guest progress merges on sign-in', () => {
  test('email sign-in: the browser copy merges (latest review wins) and is cleared', async ({ page }) => {
    await seed(page, {
      // The account knows W[5] as box 4 from long ago, and W[6] as box 3 from just now.
      progress: [prog(W[5], 4, 10 * DAY, Date.now() - 20 * DAY), { ...prog(W[6], 3, 7 * DAY), lastReviewedAt: iso(Date.now() + 60_000) }],
    });
    await seedGuest(page, [prog(W[6], 1, DAY)]);
    await page.goto(`/word/${W[5]}`);
    await waitForSea(page);
    await ready(page);
    await swipe(page, 'ArrowLeft'); // W[5] → box 1 in this browser, reviewed now
    await page.getByTestId('sign-in').click();
    await signInViaDialog(page);
    await expect(page.getByTestId('account-button')).toBeVisible();
    await expect
      .poll(async () => Object.fromEntries((await mockProgress(page)).map((p: SeedProgress) => [p.slug, p.box])))
      .toEqual({ [W[5]]: 1, [W[6]]: 3 });
    expect(await guestCopy(page)).toBeNull();
  });

  test('Google sign-in merges too', async ({ page }) => {
    await page.goto(`/word/${W[7]}`);
    await waitForSea(page);
    await ready(page);
    await swipe(page, 'ArrowRight');
    await page.getByTestId('sign-in').click();
    await dialog(page).getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByTestId('account-button')).toBeVisible();
    const googleId = await page.evaluate(() => JSON.parse(localStorage.getItem('durar-mock-db')!).sessionUserId);
    await expect.poll(async () => (await mockProgress(page, googleId)).map((p: SeedProgress) => [p.slug, p.box])).toEqual([[W[7], 2]]);
    expect(await guestCopy(page)).toBeNull();
  });

  test('across a redirect (an email link or Google coming back): merged when the page loads signed in', async ({ page }) => {
    await seed(page);
    await page.goto(`/word/${W[8]}`);
    await waitForSea(page);
    await ready(page);
    await swipe(page, 'ArrowRight');
    await expect.poll(async () => (await guestCopy(page))?.items?.length ?? 0).toBe(1);
    // The sign-in finishes on another page load (as after a redirect).
    await page.evaluate((id) => {
      const db = JSON.parse(localStorage.getItem('durar-mock-db')!);
      db.sessionUserId = id;
      localStorage.setItem('durar-mock-db', JSON.stringify(db));
    }, LAYLA.id);
    await page.reload();
    await waitForSea(page);
    await ready(page);
    await expect.poll(async () => (await mockProgress(page)).map((p: SeedProgress) => p.slug)).toEqual([W[8]]);
    expect(await guestCopy(page)).toBeNull();
  });
});

test.describe('mastery: the queue', () => {
  test('due words come back on a later day, after two new words', async ({ page: first }) => {
    let page = first;
    await page.clock.setFixedTime(T0);
    await page.goto(`/word/${W[10]}`);
    await waitForSea(page);
    await ready(page);
    await swipe(page, 'ArrowLeft'); // box 1: back tomorrow
    await expect(progressStatus(page)).toHaveText('Still learning · back tomorrow');

    // Two days later, in a new tab (same browser storage).
    await expect.poll(async () => (await guestCopy(page))?.items?.length ?? 0).toBe(1);
    const later = await page.context().newPage();
    await page.close();
    page = later;
    await page.clock.setFixedTime(T0 + 2 * DAY);
    await page.goto(`/word/${W[11]}`);
    await waitForSea(page);
    await ready(page);
    const seen = [];
    for (let i = 0; i < 3; i++) {
      await swipe(page, 'ArrowRight');
      seen.push(await focusedSlug(page));
    }
    expect(seen[2]).toBe(W[10]);
    expect(seen.slice(0, 2)).not.toContain(W[10]);
    // Right on a due box-1 word: up to box 2.
    await swipe(page, 'ArrowRight');
    await expect(progressStatus(page)).toHaveText('Marked known · returns in 3 days');
  });

  test('about one due word (most overdue, lowest box first) per two new words; Pearl of the Day stays first', async ({ page }) => {
    const now = Date.now();
    await seedGuest(page, [
      prog(W[20], 3, -1 * DAY - 60_000, now),
      prog(W[21], 1, -1 * DAY - 120_000, now),
      prog(W[22], 2, -5 * DAY, now),
      prog(W[23], 4, 20 * DAY, now), // known, not due
    ]);
    await page.goto('/');
    await waitForSea(page);
    await ready(page);
    expect(await focusedSlug(page)).toBe(potd);
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      await swipe(page, 'ArrowRight');
      seen.push(await focusedSlug(page));
    }
    const due = [W[20], W[21], W[22]];
    expect(seen.map((s) => (due.includes(s) ? 'D' : 'N')).join('')).toBe('NNDNNDNND');
    expect(seen.filter((s) => due.includes(s))).toEqual([W[22], W[21], W[20]]);
    expect(seen).not.toContain(W[23]);
  });

  test('when nothing is new or due: the calm note, and free browsing continues', async ({ page }) => {
    const now = Date.now();
    await seedGuest(
      page,
      words.map((w, i) => prog(w.slug, 2 + (i % 4), (i + 2) * DAY, now)),
    );
    await page.goto('/');
    await waitForSea(page);
    await ready(page);
    expect(await focusedSlug(page)).toBe(potd);
    await expect(page.getByTestId('met-all')).toHaveText('You’ve met every pearl for now. The sea will bring some back soon.');
    await swipe(page, 'ArrowRight');
    await swipe(page, 'ArrowRight');
    await expect(page.getByTestId('met-all')).toBeVisible();
    await noViolations(page);
    // Search still reaches any word.
    await page.getByRole('combobox').fill(words[3].translit);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('focused-word')).toHaveAttribute('data-slug', words[3].slug);
  });
});

test.describe('mastery: depth', () => {
  test('the focused card’s contrast is identical at 0% and 100% known; the water behind it deepens', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    test.setTimeout(90_000);
    const slug = W[30];
    const shots: Buffer[] = [];
    for (const all of [false, true]) {
      const ctx = await page.context().browser()!.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await ctx.newPage();
      await p.addInitScript(() => {
        (window as unknown as { __DURAR_STILL__: boolean }).__DURAR_STILL__ = true;
      });
      if (all) await seedGuest(p, words.map((w) => prog(w.slug, 5, 30 * DAY)));
      await p.goto(`/word/${slug}`);
      await waitForSea(p);
      await ready(p);
      await p.waitForTimeout(7000); // let the card settle fully into focus
      shots.push(await p.screenshot());
      await ctx.close();
    }
    const raw = async (png: Buffer, box: { left: number; top: number; width: number; height: number }) =>
      (await sharp(png).extract(box).raw().toBuffer()) as Buffer;
    // The headword and meaning at the centre of the focused card.
    const card = { left: 620, top: 300, width: 200, height: 260 };
    const [a, b] = await Promise.all(shots.map((s) => raw(s, card)));
    // WCAG contrast between the ink (brightest glyph pixels) and the card body (median).
    const contrast = (buf: Buffer) => {
      const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const lum: number[] = [];
      for (let i = 0; i < buf.length; i += 3) lum.push(0.2126 * lin(buf[i]) + 0.7152 * lin(buf[i + 1]) + 0.0722 * lin(buf[i + 2]));
      lum.sort((x, y) => x - y);
      const ink = lum[Math.floor(lum.length * 0.995)];
      const body = lum[Math.floor(lum.length * 0.5)];
      return (ink + 0.05) / (body + 0.05);
    };
    const [c0, c1] = [contrast(a), contrast(b)];
    expect(c0).toBeGreaterThan(7);
    expect(Math.abs(c1 - c0) / c0).toBeLessThan(0.01);
    // The open water along the top edge is darker when everything is known.
    const band = { left: 0, top: 70, width: 1440, height: 40 };
    const mean = (buf: Buffer) => buf.reduce((s, v) => s + v, 0) / buf.length;
    const [w0, w1] = await Promise.all(shots.map((s) => raw(s, band)));
    expect(mean(w1)).toBeLessThan(mean(w0) * 0.9);
  });

  test('reduced motion: swipes still count and are announced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedGuest(page, [prog(W[40], 3, -DAY)]);
    await page.goto(`/word/${W[40]}`);
    await waitForSea(page);
    await ready(page);
    await expect(page.getByTestId('focused-depth')).toHaveText('In the deep · 3 of 5');
    await swipe(page, 'ArrowRight');
    await expect(progressStatus(page)).toHaveText('Marked known · returns in 16 days');
  });

  test('text-only view: the same announcements and a depth label on the card', async ({ page }) => {
    await seedGuest(page, [prog(W[41], 3, 5 * DAY), prog(W[42], 1, -DAY)]);
    await page.goto(`/word/${W[41]}`);
    await waitForSea(page);
    await page.getByTestId('mode-toggle').click();
    await ready(page);
    await expect(page.getByTestId('card-depth')).toHaveText('In the deep · 3 of 5');
    await page.getByRole('combobox').fill(words.find((w) => w.slug === W[42])!.translit);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('card-depth')).toHaveText('Still learning');
    await page.keyboard.press('ArrowLeft');
    await expect(progressStatus(page)).toHaveText('Still learning · back tomorrow');
    await noViolations(page);
  });
});

test.describe('mastery: Library and reset', () => {
  const SAVED = [{ slug: 'bahr', savedAt: '2026-09-01T10:00:00.000Z' }];

  test('filters, counts, depth labels and per-filter empty states', async ({ page }) => {
    const now = Date.now();
    await seed(page, {
      signedIn: true,
      saved: SAVED,
      progress: [prog('bahr', 4, 16 * DAY, now), prog(W[50], 1, -DAY, now), prog(W[51], 2, 3 * DAY, now), prog('retired-word', 5, DAY, now)],
    });
    await page.goto('/library');
    await expect(page.getByTestId('library-count')).toHaveText('2 in the deep · 1 still learning · 1 saved');
    const list = page.getByTestId('library-list');
    await expect(list.locator('a')).toHaveCount(3);
    await expect(list.locator('a[data-slug="bahr"]')).toContainText('In the deep · 4 of 5');
    await expect(list.locator('a[data-slug="bahr"]')).toContainText('returns in 16 days');
    await expect(list.locator('a[data-slug="bahr"]')).toContainText('Saved');
    await expect(list.locator(`a[data-slug="${W[50]}"]`)).toContainText('Still learning');
    await expect(list.locator(`a[data-slug="${W[50]}"]`)).toContainText('due now');

    const filter = (name: string) => page.getByRole('group', { name: 'Show' }).getByRole('button', { name, exact: true });
    await filter('Saved').click();
    await expect(filter('Saved')).toHaveAttribute('aria-pressed', 'true');
    await expect(list.locator('a')).toHaveCount(1);
    await filter('Still learning').click();
    await expect(list.locator('a')).toHaveCount(1);
    await filter('In the deep').click();
    await expect(list.locator('a')).toHaveCount(2);
    await noViolations(page);
    await filter('All').click();
    await expect(list.locator('a')).toHaveCount(3);

    // Clicking opens the sea on that word.
    await list.locator(`a[data-slug="${W[51]}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/word/${W[51]}$`));
    await waitForSea(page);
    await expect(page.getByTestId('focused-word')).toHaveAttribute('data-slug', W[51]);
  });

  test('empty states per filter', async ({ page }) => {
    await seed(page, { signedIn: true, progress: [prog(W[52], 2, 3 * DAY)] });
    await page.goto('/library');
    const filter = (name: string) => page.getByRole('group', { name: 'Show' }).getByRole('button', { name, exact: true });
    await filter('Saved').click();
    await expect(page.getByTestId('library-empty-saved')).toContainText('No saved pearls yet.');
    await filter('Still learning').click();
    await expect(page.getByTestId('library-empty-learning')).toContainText('Nothing still learning.');
    await noViolations(page);
  });

  test('reset from the account menu defaults to keeping, then clears progress and keeps saved pearls', async ({ page }) => {
    await seed(page, { signedIn: true, saved: SAVED, progress: [prog('bahr', 3, 7 * DAY), prog(W[53], 1, DAY)] });
    await page.goto(`/word/${W[54]}`);
    await waitForSea(page);
    await ready(page);
    await page.getByTestId('account-button').click();
    await page.getByRole('menuitem', { name: 'Reset my progress…' }).click();
    const d = dialog(page);
    await expect(d.getByRole('heading')).toHaveText('Reset your progress?');
    await expect(d.getByRole('button', { name: 'Keep my progress' })).toBeFocused();
    await noViolations(page);
    await page.keyboard.press('Enter');
    await expect(d).toHaveCount(0);
    expect(await mockProgress(page)).toHaveLength(2);

    await page.getByTestId('account-button').click();
    await page.getByRole('menuitem', { name: 'Reset my progress…' }).click();
    await dialog(page).getByRole('button', { name: 'Reset progress' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(status(page)).toContainText('Your progress has been reset');
    expect(await mockProgress(page)).toEqual([]);
    await page.goto('/library');
    await expect(page.getByTestId('library-count')).toHaveText('0 in the deep · 0 still learning · 1 saved');
  });

  test('signed out: reset from the Library clears this browser’s copy', async ({ page }) => {
    await seedGuest(page, [prog(W[55], 2, 3 * DAY)]);
    await page.goto('/library');
    await expect(page.getByTestId('library-count')).toHaveText('1 in the deep · 0 still learning · 0 saved');
    await page.getByTestId('library-reset').click();
    await dialog(page).getByRole('button', { name: 'Reset progress' }).click();
    await expect(page.getByTestId('library-empty-all')).toBeVisible();
    expect(await guestCopy(page)).toBeNull();
  });

  test('deleting the account deletes its progress', async ({ page }) => {
    await seed(page, { signedIn: true, progress: [prog(W[56], 2, 3 * DAY)] });
    await page.goto('/library');
    await expect(page.getByTestId('library-count')).toHaveText('1 in the deep · 0 still learning · 0 saved');
    await page.getByTestId('account-button').click();
    await page.getByRole('menuitem', { name: /Delete my account/ }).click();
    await expect(dialog(page)).toContainText('along with your progress, and stops any Pearl of the Day email');
    await dialog(page).getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByTestId('sign-in')).toBeVisible();
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem('durar-mock-db')!));
    expect(db.progress).toEqual({});
  });
});
