import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The anatomy of a word (Phase 0.7, section G): the focused word unthreads into its letters.

const layer = (page: Page) => page.getByTestId('anatomy');
const letters = (page: Page) => page.getByTestId('anatomy-letter');

/** Waits for the letters to have slid apart and settled into their standalone shapes. */
async function settled(page: Page) {
  await expect(layer(page)).toHaveAttribute('data-settled', 'true', { timeout: 10_000 });
}

// These run in the text-only view (no WebGL): quick and steady. tests/anatomy-3d.spec.ts covers the 3D card.
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'], executablePath: process.env.PW_CHROMIUM_PATH || undefined } });

test.describe('text-only view', () => {
  test('L, the Letters button and a tap on the headword each unthread the word; Escape and Close thread it back', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/word/sarab');
    const card = page.getByTestId('html-card');
    await expect(card.locator('h2')).toHaveText('سَرَاب');

    // L, then Escape: back together, and focus returns to the Letters button.
    await page.keyboard.press('l');
    await expect(layer(page)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('سَرَاب · Letters');
    await expect(letters(page)).toHaveCount(4);
    await expect(page.getByTestId('anatomy-count')).toHaveText('4 letters');
    await expect(page.getByTestId('anatomy-letters')).toHaveAttribute('data-state', 'apart');
    await settled(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('anatomy-letters')).toHaveAttribute('data-state', 'threaded');
    await expect(layer(page)).toHaveCount(0);
    await expect(card.getByTestId('anatomy-button')).toBeFocused();

    // The arrow keys didn't swipe while it was open, and do again now.
    await expect(card.locator('h2')).toHaveText('سَرَاب');

    // The button, then Close.
    await card.getByTestId('anatomy-button').click();
    await expect(layer(page)).toBeVisible();
    await page.getByTestId('anatomy-close').click();
    await expect(layer(page)).toHaveCount(0);
    await expect(card.getByTestId('anatomy-button')).toBeFocused();

    // A tap on the headword.
    await card.locator('h2').click();
    await expect(layer(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(layer(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a swipe that starts on the headword swipes, and does not open the letters', async ({ page }) => {
    await page.goto('/word/sarab');
    const head = page.getByTestId('html-card').locator('h2');
    const box = (await head.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 400, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(head).not.toHaveText('سَرَاب');
    await expect(layer(page)).toHaveCount(0);
  });

  test('letter detail by keyboard: the arrows move right to left, each letter shows its name, sound and shapes', async ({ page }) => {
    await page.goto('/word/hilal');
    await page.keyboard.press('l');
    await settled(page);
    const detail = page.getByTestId('anatomy-detail');
    await expect(detail).toContainText('Click a letter to see its four shapes.');

    await page.keyboard.press('ArrowLeft');
    await expect(letters(page).nth(0)).toBeFocused();
    await expect(letters(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(detail).toContainText('hāʾ');
    await expect(detail).toContainText('Sounds like “h”, as in “hat”.');

    await page.keyboard.press('ArrowLeft');
    await expect(letters(page).nth(1)).toBeFocused();
    await expect(detail).toContainText('لَام');
    await expect(detail).toContainText('lām');
    await expect(detail.locator('li')).toHaveCount(4);
    // lām sits between hāʾ and alif: its middle shape is lit.
    await expect(detail.locator('li[data-here]')).toContainText(/middle/i);
    await expect(detail).toContainText('لا, but they are still two letters');

    await page.keyboard.press('End');
    await expect(letters(page).nth(3)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(letters(page).nth(2)).toBeFocused();
    await expect(detail).toContainText('alif');

    // A tap works too.
    await letters(page).nth(0).click();
    await expect(detail).toContainText('hāʾ');

    await page.keyboard.press('Escape');
    await expect(layer(page)).toHaveCount(0);
    await expect(page.getByTestId('html-card').getByTestId('anatomy-button')).toBeFocused();
  });

  test('Syllables groups the letters into beads with the sound under each', async ({ page }) => {
    await page.goto('/word/durrah');
    await page.keyboard.press('l');
    await settled(page);
    await expect(letters(page).nth(1)).toHaveAttribute('aria-label', 'رَّ rāʾ, doubled. Show its four shapes.');
    await page.getByTestId('anatomy-syllables-step').click();
    await expect(page.getByTestId('anatomy-syllables')).toBeVisible();
    await expect(page.getByTestId('anatomy-syllables').locator('li')).toHaveText(['دُرْdur', 'رَةrah']);
    await expect(page.getByTestId('anatomy-count')).toHaveText('dur · rah');
    await expect(page.getByTestId('anatomy-letters')).toBeHidden();
    await page.getByTestId('anatomy-letters-step').click();
    await expect(page.getByTestId('anatomy-letters')).toBeVisible();
  });

  test('screen readers get the whole word described', async ({ page }) => {
    await page.goto('/word/durrah');
    await page.keyboard.press('l');
    await expect(page.getByRole('dialog')).toHaveAccessibleDescription(
      'دُرَّة, 3 letters: dāl, rāʾ (doubled), tāʾ marbūṭah. None of them join the next letter. Syllables: dur · rah.',
    );
  });

  test('reduced motion: the letters fade in apart, with no slide', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/word/hilal');
    await page.keyboard.press('l');
    await expect(layer(page)).toHaveAttribute('data-reduced', 'true');
    // Apart from the first frame: no threaded stage to slide out of.
    await expect(page.getByTestId('anatomy-letters')).toHaveAttribute('data-state', 'apart');
    expect(await letters(page).nth(1).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    await settled(page);
    await page.keyboard.press('Escape');
    await expect(layer(page)).toHaveCount(0);
  });

  test('axe: no violations with the letters open, a letter shown, and the syllables', async ({ page }) => {
    await page.goto('/word/hilal');
    await page.keyboard.press('l');
    await settled(page);
    await letters(page).nth(1).click();
    const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    let { violations } = await scan();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
    await page.getByTestId('anatomy-syllables-step').click();
    await page.waitForTimeout(700);
    ({ violations } = await scan());
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });

  test('teaching animation: peek and glint play the first 3 times Letters opens, then never again', async ({ page }) => {
    await page.goto('/word/hilal');
    for (let n = 1; n <= 4; n++) {
      await page.keyboard.press('l');
      await settled(page);
      if (n <= 3) {
        await expect(layer(page), `opening ${n}`).toHaveAttribute('data-teach', 'true');
        // The peek: the first (rightmost) letter's standalone shape, beside it, unread by screen readers.
        await expect(page.getByTestId('anatomy-peek')).toHaveCount(1);
        await expect(letters(page).nth(0).getByTestId('anatomy-peek')).toHaveText('هِ');
        await expect(page.getByTestId('anatomy-peek')).toHaveAttribute('aria-hidden', 'true');
        // The glint runs along every letter, one after the other.
        const names = await letters(page).evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
        expect(names.every((name) => name.includes('anat-glint'))).toBe(true);
        expect(names[0]).toContain('anat-peek-lift');
      } else {
        await expect(layer(page), `opening ${n}`).not.toHaveAttribute('data-teach', /.*/);
        await expect(page.getByTestId('anatomy-peek')).toHaveCount(0);
      }
      await page.keyboard.press('Escape');
      await expect(layer(page)).toHaveCount(0);
    }
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('durar-anatomy-teach')!))).toEqual({ shown: 3, tapped: false });
  });

  test('teaching animation: never again once a letter has been tapped', async ({ page }) => {
    await page.goto('/word/hilal');
    await page.keyboard.press('l');
    await settled(page);
    await expect(layer(page)).toHaveAttribute('data-teach', 'true');
    await letters(page).nth(1).click();
    // It stops at once, and the next opening (after a reload too) has none.
    await expect(layer(page)).not.toHaveAttribute('data-teach', /.*/);
    await page.keyboard.press('Escape');
    await page.reload();
    await page.keyboard.press('l');
    await settled(page);
    await expect(layer(page)).not.toHaveAttribute('data-teach', /.*/);
    await expect(page.getByTestId('anatomy-peek')).toHaveCount(0);
  });

  test('hover: with a mouse a letter lifts and glows, with a pointer cursor', async ({ page }) => {
    await page.goto('/word/sarab');
    await page.keyboard.press('l');
    await settled(page);
    const first = letters(page).nth(0);
    expect(await first.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
    await first.hover();
    await expect.poll(() => first.evaluate((el) => getComputedStyle(el).translate)).not.toBe('none');
    expect(await first.evaluate((el) => getComputedStyle(el).textShadow)).not.toBe('none');
  });

  test('reduced motion: no teaching animation, and a faint dotted underline instead', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/word/hilal');
    await page.keyboard.press('l');
    await settled(page);
    await expect(layer(page)).not.toHaveAttribute('data-teach', /.*/);
    await expect(page.getByTestId('anatomy-peek')).toHaveCount(0);
    const deco = await letters(page)
      .nth(0)
      .locator('.anat-alone')
      .evaluate((el) => getComputedStyle(el).textDecorationStyle + ' ' + getComputedStyle(el).textDecorationLine);
    expect(deco).toBe('dotted underline');
    // Nothing moves on hover either.
    await letters(page).nth(0).hover();
    await page.waitForTimeout(400);
    expect(await letters(page).nth(0).evaluate((el) => getComputedStyle(el).translate)).toBe('none');
    // A reduced-motion opening doesn't use up one of the 3 showings.
    expect(await page.evaluate(() => localStorage.getItem('durar-anatomy-teach'))).toBeNull();
  });

  test('every letter is a button named by its shape and name, then what it does', async ({ page }) => {
    await page.goto('/word/hilal');
    await page.keyboard.press('l');
    await expect(page.getByRole('button', { name: 'لَ lām. Show its four shapes.' })).toBeVisible();
  });

  // Visual snapshots: a word of letters that never touch, one with a long ā, one with لا and one
  // with shadda. Still frames (reduced motion) so the animation can't make them flaky.
  for (const slug of ['sarab', 'hilal', 'durrah', 'luulu']) {
    test(`snapshot: ${slug}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/word/${slug}`);
      await page.evaluate(() => document.fonts.ready);
      await page.keyboard.press('l');
      await settled(page);
      await page.mouse.move(0, 0);
      await expect(page.getByTestId('anatomy-letters')).toHaveScreenshot(`anatomy-${slug}.png`, { maxDiffPixelRatio: 0.02 });
    });
  }
});

test.describe('touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 860 } });

  test('the hint says tap, and says click once a mouse is used', async ({ page }) => {
    await page.goto('/word/sarab');
    await page.getByTestId('html-card').getByTestId('anatomy-button').tap();
    await settled(page);
    await expect(page.getByTestId('anatomy-hint')).toHaveText('Tap a letter to see its four shapes.');
    // A mouse on the same screen (say, a touch laptop): the words follow it.
    await page.getByTestId('anatomy-count').click();
    await expect(page.getByTestId('anatomy-hint')).toHaveText('Click a letter to see its four shapes.');
    await page.getByTestId('anatomy-count').tap();
    await expect(page.getByTestId('anatomy-hint')).toHaveText('Tap a letter to see its four shapes.');
  });
});
