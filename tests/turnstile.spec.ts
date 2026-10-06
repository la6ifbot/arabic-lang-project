import { test as plain, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { dialog, expect, LAYLA, seed, test } from './accounts';

/**
 * Cloudflare Turnstile on the subscribe, sign-up, sign-in and reset forms. These run in the text-only
 * view (no WebGL), which shares the forms with the 3D sea. Most use a local stand-in for Cloudflare's
 * script so they need no network; the last one loads the real script with Cloudflare's test key.
 */
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'], executablePath: process.env.PW_CHROMIUM_PATH || undefined } });

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js*';
// Cloudflare's test site keys: invisible and always passes / visible and always fails.
const PASSES = '1x00000000000000000000BB';
const FAILS = '2x00000000000000000000AB';

// Behaves like the real widget: a token arrives shortly after rendering, and after each reset;
// a key starting with "2x" fails instead.
const STUB = `
window.turnstile = (() => {
  let n = 0;
  const widgets = {};
  const run = (id) => {
    const w = widgets[id];
    setTimeout(() => {
      if (!widgets[id]) return;
      if (w.o.sitekey.startsWith('2x')) w.o['error-callback']?.('110200');
      else w.o.callback?.('stub-token-' + ++n);
    }, 150);
  };
  return {
    render(el, o) { const id = 'w' + Object.keys(widgets).length; widgets[id] = { el, o }; run(id); return id; },
    reset(id) { run(id); },
    remove(id) { delete widgets[id]; },
  };
})();`;

async function useTurnstile(page: Page, siteKey: string, script: 'stub' | 'blocked' | 'real' = 'stub') {
  await page.addInitScript((key) => ((window as unknown as { __DURAR_TURNSTILE_SITEKEY__: string }).__DURAR_TURNSTILE_SITEKEY__ = key), siteKey);
  if (script === 'stub') await page.route(SCRIPT, (r: Route) => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  if (script === 'blocked') await page.route(SCRIPT, (r: Route) => r.abort());
}

type Mock = { __durarMock: { captchas(): { op: string; token: string | null }[]; verify(email: string): void } };
const captchas = (page: Page) => page.evaluate(() => (window as unknown as Mock).__durarMock.captchas());

async function openSignIn(page: Page) {
  await page.goto('/word/sabr');
  await expect(page.getByTestId('html-card')).toBeVisible();
  await page.getByTestId('sign-in').click();
  await expect(dialog(page).getByRole('heading')).toHaveText('Sign in');
}

test.describe('Turnstile', () => {
  test('sign-up, sign-in, reset and resend each carry a fresh token', async ({ page }) => {
    await useTurnstile(page, PASSES);
    await seed(page);
    await openSignIn(page);
    const d = dialog(page);

    await d.getByRole('button', { name: 'Create an account' }).click();
    await d.getByLabel('Email').fill('new.diver@example.com');
    await d.getByLabel('Password', { exact: true }).fill('a sea of words');
    await d.getByRole('button', { name: 'Create account' }).click();
    await expect(d.getByRole('heading')).toHaveText('Check your inbox');
    await d.getByRole('button', { name: 'Resend the link' }).click();
    await expect(d.getByRole('button', { name: 'Sent again' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByTestId('sign-in').click();
    await d.getByRole('button', { name: 'Forgot your password?' }).click();
    await d.getByLabel('Email').fill(LAYLA.email);
    await d.getByRole('button', { name: 'Send reset link' }).click();
    await expect(d.getByRole('heading')).toHaveText('Check your inbox');
    await d.getByRole('button', { name: 'Back to sign in' }).click();
    await d.getByLabel('Email').fill(LAYLA.email);
    await d.getByLabel('Password', { exact: true }).fill(LAYLA.password);
    await d.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(d).toBeHidden();

    const sent = await captchas(page);
    expect(sent.map((c) => c.op)).toEqual(['signUp', 'resendVerification', 'requestPasswordReset', 'signIn']);
    for (const c of sent) expect(c.token).toMatch(/^stub-token-\d+$/);
    // Tokens are single-use: no two requests share one.
    expect(new Set(sent.map((c) => c.token)).size).toBe(sent.length);
  });

  // The real /api/subscribe client (not the accounts mock), answered by a stub.
  plain('subscribe sends the token to /api/subscribe', async ({ page }) => {
    await useTurnstile(page, PASSES);
    const bodies: Record<string, string>[] = [];
    await page.route('**/api/subscribe', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true, status: 'check_inbox' } });
    });
    await page.goto('/');
    await expect(page.getByTestId('html-card')).toBeVisible();
    await page.getByTestId('subscribe-open').click();
    const d = dialog(page);
    await d.getByLabel('Email').fill('reader@example.com');
    await d.getByRole('button', { name: 'Send me the pearls' }).click();
    await expect(d.getByRole('heading')).toHaveText('Check your inbox to confirm');
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ email: 'reader@example.com', turnstile: expect.stringMatching(/^stub-token-/) });
  });

  test('a failed check shows a friendly, announced error and sends nothing', async ({ page }) => {
    await useTurnstile(page, FAILS);
    await seed(page);
    await openSignIn(page);
    const d = dialog(page);
    await d.getByLabel('Email').fill(LAYLA.email);
    await d.getByLabel('Password', { exact: true }).fill(LAYLA.password);
    await d.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(d.getByRole('alert')).toContainText('quick check that keeps bots out');
    expect(await captchas(page)).toEqual([]);
    const { violations } = await new AxeBuilder({ page }).include('[role=dialog]').analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  // The real /api/subscribe client (not the accounts mock), answered by a stub.
  plain('a blocked Turnstile script on the subscribe form', async ({ page }) => {
    await useTurnstile(page, PASSES, 'blocked');
    let calls = 0;
    await page.route('**/api/subscribe', (route) => {
      calls++;
      return route.fulfill({ json: { ok: true, status: 'check_inbox' } });
    });
    await page.goto('/');
    await expect(page.getByTestId('html-card')).toBeVisible();
    await page.getByTestId('subscribe-open').click();
    const d = dialog(page);
    await d.getByLabel('Email').fill('reader@example.com');
    await d.getByRole('button', { name: 'Send me the pearls' }).click();
    await expect(d.getByRole('alert')).toContainText('quick check that keeps bots out');
    expect(calls).toBe(0);
  });

  // The real /api/subscribe client (not the accounts mock), answered by a stub.
  plain('the server refusing a token is explained the same way', async ({ page }) => {
    await useTurnstile(page, PASSES);
    await page.route('**/api/subscribe', (route) => route.fulfill({ status: 403, json: { error: 'captcha_failed' } }));
    await page.goto('/');
    await expect(page.getByTestId('html-card')).toBeVisible();
    await page.getByTestId('subscribe-open').click();
    const d = dialog(page);
    await d.getByLabel('Email').fill('reader@example.com');
    await d.getByRole('button', { name: 'Send me the pearls' }).click();
    await expect(d.getByRole('alert')).toContainText('quick check that keeps bots out');
  });

  test('with Cloudflare’s real script and test key, sign-up gets the test token', async ({ page }) => {
    await useTurnstile(page, PASSES, 'real');
    await seed(page);
    await openSignIn(page);
    const d = dialog(page);
    await d.getByRole('button', { name: 'Create an account' }).click();
    await d.getByLabel('Email').fill('new.diver@example.com');
    await d.getByLabel('Password', { exact: true }).fill('a sea of words');
    await d.getByRole('button', { name: 'Create account' }).click();
    await expect(d.getByRole('heading')).toHaveText('Check your inbox', { timeout: 30_000 });
    expect(await captchas(page)).toEqual([{ op: 'signUp', token: 'XXXX.DUMMY.TOKEN.XXXX' }]);
  });
});
