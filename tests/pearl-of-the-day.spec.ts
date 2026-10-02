import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dialog, LAYLA, saveButton, seed, signInViaDialog, test as accountTest, waitForSea } from './accounts';
import { focused, focusedSlug, today, waitForScene } from './helpers';
import words from '../src/data/words.json' with { type: 'json' };

const other = words.find((w) => w.slug !== today().slug && w.slug !== 'bahr')!;
const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('[data-testid=scene]');

test.describe('Pearl of the Day on the site', () => {
  test('“/” opens on today’s pearl with the bilingual label', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await expect(focused(page)).toHaveAttribute('data-slug', today().slug);
    const label = page.getByTestId('pearl-of-the-day');
    await expect(label).toContainText('Pearl of the Day');
    await expect(label.locator('[lang="ar"]')).toHaveText('دُرَّةُ اليَوْم');
    await expect(label.locator('[lang="ar"]')).toHaveAttribute('dir', 'rtl');
    // The label belongs to today's card only.
    await page.keyboard.press('ArrowRight');
    await expect(label).toHaveCount(0);
  });

  test('deep links are unaffected', async ({ page }) => {
    await page.goto(`/word/${other.slug}`);
    await waitForScene(page);
    await expect(focused(page)).toHaveAttribute('data-slug', other.slug);
    await expect(page.getByTestId('pearl-of-the-day')).toHaveCount(0);
  });

  test('the text-only view shows the same pearl and label', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await page.getByTestId('mode-toggle').click();
    await expect(page.getByTestId('html-card').locator('h2')).toHaveText(today().ar);
    await expect(page.getByTestId('text-view').getByTestId('pearl-of-the-day')).toBeVisible();
  });
});

test.describe('still learning: linger', () => {
  test('the lingering card never blocks: the next card is focused and swipeable at once', async ({ page }) => {
    await page.goto(`/word/${other.slug}`);
    await waitForScene(page);
    await page.keyboard.press('ArrowLeft');
    const next = await focusedSlug(page);
    expect(next).not.toBe(other.slug);
    // Swipe again straight away, well inside the linger window.
    await page.keyboard.press('ArrowRight');
    await expect(focused(page)).not.toHaveAttribute('data-slug', next);
  });

  test('a still-learning word comes back twice, spaced out', async ({ page }) => {
    await page.goto(`/word/${other.slug}`);
    await waitForScene(page);
    await page.keyboard.press('ArrowLeft');
    const seen: string[] = [];
    for (let i = 0; i < 14; i++) {
      seen.push(await focusedSlug(page));
      await page.keyboard.press('ArrowRight'); // “known” every time after the first swipe
    }
    const returns = seen.map((s, i) => (s === other.slug ? i : -1)).filter((i) => i >= 0);
    // Back after 3 cards, then (known on review) once more after 7 more.
    expect(returns).toEqual([3, 11]);
  });

  test('the text-only view keeps the word visible a moment longer', async ({ page }) => {
    await page.goto(`/word/${other.slug}`);
    await waitForScene(page);
    await page.getByTestId('mode-toggle').click();
    await page.keyboard.press('ArrowLeft');
    const ghost = page.getByTestId('linger-card');
    await expect(ghost).toBeVisible();
    await expect(ghost).toContainText(other.translit);
    await expect(ghost).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('html-card').locator('h2')).not.toHaveText(other.ar);
    await expect(ghost).toHaveCount(0, { timeout: 6000 });
  });
});

test.describe('Pearl of the Day by email: sign-up form', () => {
  test('success, invalid email, and a honeypot that stays out of reach', async ({ page }) => {
    const bodies: Record<string, string>[] = [];
    await page.route('**/api/subscribe', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true, status: 'check_inbox' } });
    });
    await page.goto('/');
    await waitForScene(page);
    await page.getByTestId('subscribe-open').click();
    const d = page.getByRole('dialog');
    await expect(d.getByRole('heading')).toHaveText('Pearl of the Day by email');
    await expect(d.getByLabel('Email')).toBeFocused();

    await d.getByLabel('Email').fill('not an email');
    await d.getByRole('button', { name: 'Send me the pearls' }).click();
    await expect(d.getByRole('alert')).toHaveText('That email address doesn’t look right.');
    expect(bodies).toHaveLength(0);

    // The honeypot isn't visible or reachable by keyboard.
    const hp = page.locator('#subscribe-extra');
    await expect(hp).toHaveAttribute('tabindex', '-1');
    expect(await hp.evaluate((el) => el.getBoundingClientRect().right < 0)).toBe(true);
    // Nothing invites a browser or password manager to fill it in for a person.
    await expect(hp).not.toHaveAttribute('name', /web|url|site|home/i);
    await expect(hp).toHaveAttribute('autocomplete', 'off');
    await expect(hp).toHaveAttribute('data-1p-ignore', /.*/);
    await expect(hp).toHaveAttribute('data-lpignore', 'true');

    await d.getByLabel('Email').fill('Reader@Example.com');
    await d.getByRole('button', { name: 'Send me the pearls' }).click();
    await expect(d.getByRole('heading')).toHaveText('Check your inbox to confirm');
    await expect(d.getByRole('status')).toContainText('reader@example.com');
    expect(bodies).toEqual([{ email: 'reader@example.com', website: '' }]);

    const { violations } = await axe(page).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('subscribe-open')).toBeFocused();
  });

  test('a bot filling the honeypot sends it to the server, which ignores it', async ({ page }) => {
    let body: Record<string, string> | null = null;
    await page.route('**/api/subscribe', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, status: 'check_inbox' } });
    });
    await page.goto('/');
    await waitForScene(page);
    await page.getByTestId('subscribe-open').click();
    await page.locator('#subscribe-extra').fill('http://spam.example', { force: true });
    await page.getByRole('dialog').getByLabel('Email').fill('bot@example.com');
    await page.getByRole('dialog').getByRole('button', { name: 'Send me the pearls' }).click();
    await expect(page.getByRole('dialog').getByRole('heading')).toHaveText('Check your inbox to confirm');
    expect(body).toEqual({ email: 'bot@example.com', website: 'http://spam.example' });
  });

  for (const [what, reply] of [
    ['a refusal', { status: 403, body: 'Forbidden', contentType: 'text/plain' }],
    ['a missing endpoint', { status: 404, json: { error: 'not_found' } }],
    ['a web page instead of the endpoint', { status: 200, body: '<!doctype html><title>Durar</title>', contentType: 'text/html' }],
  ] as const) {
    test(`${what} never says “check your inbox”`, async ({ page }) => {
      await page.route('**/api/subscribe', (route) => route.fulfill(reply));
      await page.goto('/');
      await waitForScene(page);
      await page.getByTestId('subscribe-open').click();
      const d = page.getByRole('dialog');
      await d.getByLabel('Email').fill('reader@example.com');
      await d.getByRole('button', { name: 'Send me the pearls' }).click();
      await expect(d.getByRole('alert')).toHaveText('Something went wrong on our side. Please try again in a moment.');
      await expect(d.getByRole('heading')).toHaveText('Pearl of the Day by email');
    });
  }

  test('too many tries says so kindly', async ({ page }) => {
    await page.route('**/api/subscribe', (route) => route.fulfill({ status: 429, json: { error: 'rate_limited' } }));
    await page.goto('/');
    await waitForScene(page);
    await page.getByTestId('subscribe-open').click();
    await page.getByRole('dialog').getByLabel('Email').fill('reader@example.com');
    await page.getByRole('dialog').getByRole('button', { name: 'Send me the pearls' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Too many tries');
  });

  test('also available from the text-only view', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await page.getByTestId('mode-toggle').click();
    await page.getByTestId('text-view').getByTestId('subscribe-open').click();
    await expect(page.getByRole('dialog').getByRole('heading')).toHaveText('Pearl of the Day by email');
  });

  test('hidden in production until domain day (flag off)', async ({ page }) => {
    await page.addInitScript(() => ((window as unknown as { __DURAR_EMAIL_SIGNUP__: boolean }).__DURAR_EMAIL_SIGNUP__ = false));
    await page.goto('/');
    await waitForScene(page);
    await expect(page.getByTestId('pearl-of-the-day')).toBeVisible();
    await expect(page.getByTestId('subscribe-open')).toHaveCount(0);
  });
});

test.describe('email link pages', () => {
  test('confirm: a valid link confirms, with no sign-in', async ({ page }) => {
    let token = '';
    await page.route('**/api/confirm', async (route) => {
      token = route.request().postDataJSON().token;
      await route.fulfill({ json: { status: 'confirmed' } });
    });
    await page.goto('/subscribe/confirm?token=abc123');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('You’re in');
    expect(token).toBe('abc123');
    await expect(page.getByRole('link', { name: /Meet today’s pearl/ })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    const { violations } = await axe(page).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  test('confirm: an expired link offers a fresh start', async ({ page }) => {
    await page.route('**/api/confirm', (route) => route.fulfill({ status: 400, json: { status: 'expired' } }));
    await page.goto('/subscribe/confirm?token=old');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This link has expired');
    await page.getByRole('button', { name: 'Subscribe again' }).click();
    await expect(page.getByRole('dialog').getByRole('heading')).toHaveText('Pearl of the Day by email');
  });

  test('unsubscribe: one visit unsubscribes; resubscribe is one more click', async ({ page }) => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    await page.route('**/api/unsubscribe*', async (route) => {
      const r = route.request();
      const body = r.postDataJSON();
      calls.push({ url: r.url(), method: r.method(), body });
      await route.fulfill({ json: { status: body?.action === 'resubscribe' ? 'confirmed' : 'unsubscribed' } });
    });
    await page.goto('/unsubscribe?token=sub-1.sig');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('You’re unsubscribed');
    expect(calls[0].method).toBe('POST');
    expect(new URL(calls[0].url).searchParams.get('token')).toBe('sub-1.sig');
    await page.getByRole('button', { name: /resubscribe/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back');
    expect(calls[1].body).toEqual({ action: 'resubscribe' });
    const { violations } = await axe(page).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  test('the served HTML for email pages is noindex', async ({ request }) => {
    for (const path of ['/unsubscribe', '/subscribe/confirm']) {
      expect(await (await request.get(path)).text()).toContain('<meta name="robots" content="noindex" />');
    }
  });

  test('word pages carry their preview image; the general card is on /', async ({ request }) => {
    const html = await (await request.get('/word/bahr')).text();
    expect(html).toMatch(/<meta property="og:image" content="https?:\/\/[^"]+\/cards\/og\/bahr\.png" \/>/);
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:alt" content="بَحْر (baḥr): sea" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(await (await request.get('/')).text()).toMatch(/og:image" content="[^"]+\/cards\/og\/durar\.png"/);
    const png = await request.get('/cards/og/bahr.png');
    expect(png.ok()).toBe(true);
    expect(png.headers()['content-type']).toContain('image/png');
    expect((await request.get('/cards/email/bahr.png')).ok()).toBe(true);
  });
});

accountTest.describe('accounts: interim mode and the email toggle', () => {
  accountTest('with “Confirm email” off, sign-up signs you straight in and keeps the pearl', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('durar-mock-db', JSON.stringify({ settings: { confirmEmail: false }, users: [], sessionUserId: null, saved: {}, outbox: [] })));
    await page.goto('/word/hanin');
    await waitForSea(page);
    await saveButton(page).click();
    const d = dialog(page);
    await d.getByRole('button', { name: 'Create an account' }).click();
    await d.getByLabel('Email').fill('instant@example.com');
    await d.getByLabel('Password', { exact: true }).fill('a sea of words');
    await d.getByRole('button', { name: 'Create account' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('account-button')).toBeVisible();
    await expect(saveButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('focused-word')).toHaveAttribute('data-slug', 'hanin');
  });

  accountTest('when reset emails can’t be sent, the message is friendly and offers Google', async ({ page }) => {
    await page.addInitScript(
      (u) => localStorage.setItem('durar-mock-db', JSON.stringify({ settings: { confirmEmail: false, emailDelivery: false }, users: [u], sessionUserId: null, saved: {}, outbox: [] })),
      LAYLA,
    );
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('sign-in').click();
    await dialog(page).getByRole('button', { name: 'Forgot your password?' }).click();
    await dialog(page).getByLabel('Email').fill(LAYLA.email);
    await dialog(page).getByRole('button', { name: 'Send reset link' }).click();
    const alert = dialog(page).getByRole('alert');
    await expect(alert).toContainText('can’t send emails just yet');
    await expect(alert).toContainText('If you signed up with Google');
    await alert.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByTestId('account-button')).toBeVisible();
  });

  accountTest('account menu toggle: Google accounts subscribe at once and can switch off', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('sign-in').click();
    await dialog(page).getByRole('button', { name: 'Continue with Google' }).click();
    await page.getByTestId('account-button').click();
    const toggle = page.getByTestId('email-toggle');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('account-status')).toContainText('You’re subscribed');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('account-status')).toContainText('email is off');
  });

  accountTest('account menu toggle: email accounts confirm by email first', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('sign-in').click();
    await signInViaDialog(page);
    await page.getByTestId('account-button').click();
    const toggle = page.getByTestId('email-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'mixed');
    await expect(toggle).toContainText('Confirm in inbox');
    await expect(page.getByTestId('account-status')).toContainText(`Check your inbox (${LAYLA.email})`);
  });

  accountTest('the account toggle follows the production flag', async ({ page }) => {
    await page.addInitScript(() => ((window as unknown as { __DURAR_EMAIL_SIGNUP__: boolean }).__DURAR_EMAIL_SIGNUP__ = false));
    await seed(page, { signedIn: true });
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('account-button').click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByTestId('email-toggle')).toHaveCount(0);
  });
});
