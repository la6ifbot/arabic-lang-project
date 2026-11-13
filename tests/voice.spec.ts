import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import words from '../src/data/words.json' with { type: 'json' };
import { wordAudio } from '../shared/audio';
import { waitForScene } from './helpers';

// Speaker buttons (Phase 0.8, decision 4). The audio host is faked with a short generated WAV, and
// every HTMLMediaElement.play() is recorded, so the tests can see what played, how fast, and that
// nothing ever played on its own.
const durrah = words.find((w) => w.slug === 'durrah')!;
const AUDIO = wordAudio(durrah);

/** A mono 8 kHz WAV of `seconds` of silence. */
function wav(seconds: number) {
  const n = Math.round(8000 * seconds);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  return b;
}

async function fakeAudio(page: Page, { fail = false, seconds = 1.2 } = {}) {
  const asked: string[] = [];
  await page.route('https://img.durar.space/audio/**', (route) => {
    asked.push(new URL(route.request().url()).pathname.slice(1));
    return fail ? route.fulfill({ status: 403, body: '' }) : route.fulfill({ body: wav(seconds), headers: { 'content-type': 'audio/wav' } });
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __played: { src: string; rate: number; pitch: boolean }[] };
    w.__played = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      w.__played.push({ src: this.src, rate: this.playbackRate, pitch: this.preservesPitch });
      return play.call(this);
    };
  });
  return asked;
}

const played = (page: Page) => page.evaluate(() => (window as unknown as { __played: { src: string; rate: number; pitch: boolean }[] }).__played);
const textCard = (page: Page) => page.getByTestId('html-card');

async function openTextView(page: Page, slug = 'durrah') {
  await page.goto(`/word/${slug}`);
  await page.getByTestId('mode-toggle').click();
  await expect(textCard(page).locator('h2')).toBeVisible();
}

test.describe('speaker buttons, text-only view', () => {
  test('play the word and each sentence by mouse, with states and the live region; never on their own', async ({ page }) => {
    const asked = await fakeAudio(page);
    await openTextView(page);
    const card = textCard(page);
    const word = card.getByTestId('speak-word');
    await expect(word).toHaveAccessibleName('Play the word دُرَّة');
    await expect(card.getByTestId('speak-sentence')).toHaveCount(durrah.examples.length);

    // The focused card's audio is fetched while idle, but nothing plays until a press.
    await expect.poll(() => asked.includes(AUDIO.word)).toBe(true);
    await page.waitForTimeout(500);
    expect(await played(page)).toEqual([]);

    await word.click();
    await expect(word).toHaveAttribute('data-state', 'playing');
    await expect(page.getByTestId('voice-status')).toHaveText('Playing the word دُرَّة');
    await expect(word).toHaveAttribute('data-state', 'idle', { timeout: 5000 });
    expect((await played(page)).map((p) => p.src)).toEqual([`https://img.durar.space/${AUDIO.word}`]);

    await card.getByTestId('speak-sentence').nth(1).click();
    await expect(card.getByTestId('speak-sentence').nth(1)).toHaveAttribute('data-state', 'playing');
    expect((await played(page)).at(-1)!.src).toBe(`https://img.durar.space/${AUDIO.examples[1]}`);

    // Pressing the playing button stops it.
    await card.getByTestId('speak-sentence').nth(1).click();
    await expect(card.getByTestId('speak-sentence').nth(1)).toHaveAttribute('data-state', 'idle');
  });

  test('slow voice plays at 0.75× with the pitch kept, and is remembered', async ({ page }) => {
    await fakeAudio(page);
    await openTextView(page);
    const slow = page.getByTestId('slow-toggle');
    await expect(slow).toHaveAttribute('aria-pressed', 'false');
    await slow.click();
    await expect(slow).toHaveAttribute('aria-pressed', 'true');
    await textCard(page).getByTestId('speak-word').click();
    await expect(page.getByTestId('voice-status')).toHaveText('Playing the word دُرَّة, slowly');
    expect((await played(page)).at(-1)).toMatchObject({ rate: 0.75, pitch: true });

    await page.reload();
    await expect(page.getByTestId('slow-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a missing file says “Audio unavailable”', async ({ page }) => {
    await fakeAudio(page, { fail: true });
    await openTextView(page);
    await textCard(page).getByTestId('speak-word').click();
    await expect(textCard(page).getByTestId('speak-error')).toHaveText('Audio unavailable');
    await expect(textCard(page).getByTestId('speak-word')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByTestId('voice-status')).toHaveText('Audio unavailable');
  });

  test('keyboard: Tab + Enter, P for the word and Shift+P for the sentence', async ({ page }) => {
    await fakeAudio(page);
    await openTextView(page);
    await textCard(page).getByTestId('speak-word').focus();
    await page.keyboard.press('Enter');
    await expect(textCard(page).getByTestId('speak-word')).toHaveAttribute('data-state', 'playing');

    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Shift+P');
    await expect(page.getByTestId('voice-status')).toHaveText('Playing the example sentence');
    expect((await played(page)).at(-1)!.src).toBe(`https://img.durar.space/${AUDIO.examples[0]}`);
    await page.keyboard.press('p');
    await expect(page.getByTestId('voice-status')).toHaveText('Playing the word دُرَّة');
    expect((await played(page)).at(-1)!.src).toBe(`https://img.durar.space/${AUDIO.word}`);
  });

  test('a new card stops the last one’s audio', async ({ page }) => {
    await fakeAudio(page, { seconds: 4 });
    await openTextView(page);
    await textCard(page).getByTestId('speak-word').click();
    await expect(textCard(page).getByTestId('speak-word')).toHaveAttribute('data-state', 'playing');
    await page.keyboard.press('ArrowRight');
    await expect(textCard(page).locator('h2')).not.toHaveText(durrah.ar);
    await expect(page.locator('[data-testid=speak-word][data-state=playing]')).toHaveCount(0);
  });

  test('axe finds nothing with the speakers showing and one failed', async ({ page }) => {
    await fakeAudio(page, { fail: true });
    await openTextView(page);
    await textCard(page).getByTestId('speak-word').click();
    await expect(textCard(page).getByTestId('speak-error')).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });
});

test.describe('speaker buttons, touch', () => {
  test.use({ hasTouch: true });
  test('a tap plays the word, and does not count as a swipe', async ({ page }) => {
    await fakeAudio(page);
    await openTextView(page);
    await textCard(page).getByTestId('speak-word').tap();
    await expect(textCard(page).getByTestId('speak-word')).toHaveAttribute('data-state', 'playing');
    await expect(textCard(page).locator('h2')).toHaveText(durrah.ar);
  });
});

test('the 3D card has word and sentence speakers beside Letters, Share and Save', async ({ page }) => {
  await fakeAudio(page);
  await page.goto('/word/durrah');
  await waitForScene(page);
  const actions = page.locator('.save-anchor .card-actions');
  await expect(actions.getByTestId('speak-word')).toHaveAccessibleName('Play the word دُرَّة');
  await expect(actions.getByTestId('speak-sentence')).toHaveAccessibleName('Play the example sentence');
  // The screen-reader mirror of the card has no buttons of its own.
  await expect(page.getByTestId('focused-word').getByRole('button')).toHaveCount(0);
  expect(await played(page)).toEqual([]);
  await actions.getByTestId('speak-sentence').click();
  await expect(actions.getByTestId('speak-sentence')).toHaveAttribute('data-state', 'playing');
  expect((await played(page)).at(-1)!.src).toBe(`https://img.durar.space/${AUDIO.examples[0]}`);
});
