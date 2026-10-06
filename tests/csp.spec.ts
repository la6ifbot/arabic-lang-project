import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { routeIllustrations, waitForScene } from './helpers';

/**
 * The Content-Security-Policy in vercel.json (the preview server sends the same headers) is
 * violated nowhere: every page type, the text-only view, the sign-in and subscribe forms with
 * Turnstile, and Share's image download.
 */
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
const siteWide = vercel.headers.find((h) => h.source === '/(.*)')!.headers;
const csp = siteWide.find((h) => /^Content-Security-Policy(-Report-Only)?$/.test(h.key))!;

async function watchViolations(page: Page) {
  const seen: string[] = [];
  await page.exposeFunction('__cspViolation', (v: string) => seen.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __cspViolation(v: string): void }).__cspViolation(`${e.violatedDirective} ${e.blockedURI} on ${location.pathname}`),
    );
  });
  page.on('console', (m) => /Content.Security.Policy/i.test(m.text()) && seen.push(m.text()));
  // A stand-in for Cloudflare's script, served from its real address so the policy still applies.
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: 'window.turnstile={render(){return "w"},reset(){},remove(){}};' }),
  );
  await page.addInitScript(() => {
    const w = window as unknown as { __DURAR_TURNSTILE_SITEKEY__: string; __DURAR_MOCK__: boolean };
    w.__DURAR_TURNSTILE_SITEKEY__ = '1x00000000000000000000BB';
    w.__DURAR_MOCK__ = true; // accounts, so the sign-in form exists
  });
  await routeIllustrations(page);
  return seen;
}

test('the policy covers what the checklist asks for', () => {
  const p = csp.value;
  expect(p).toContain("default-src 'self'");
  expect(p).toContain("frame-ancestors 'none'");
  expect(p).toContain("object-src 'none'");
  expect(p).not.toContain("'unsafe-eval'");
  expect(p).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  const keys = siteWide.map((h) => h.key);
  for (const k of ['Strict-Transport-Security', 'Cross-Origin-Opener-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy']) {
    expect(keys).toContain(k);
  }
});

test('the preview server sends the policy', async ({ request }) => {
  const res = await request.get('/');
  expect(res.headers()[csp.key.toLowerCase()]).toBe(csp.value);
});

test('static pages break no rule', async ({ page }) => {
  const seen = await watchViolations(page);
  for (const path of ['/privacy', '/credits', '/library', '/subscribe/confirm?token=nope', '/unsubscribe?token=nope', '/no-such-page']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  // The 404 page's search runs from its own script file.
  await page.getByRole('searchbox').fill('sea');
  await expect(page.locator('.lost-results a').first()).toBeVisible();
  expect(seen).toEqual([]);
});

test('the sea, a word, a topic, the text-only view, the forms and Share break no rule', async ({ page }) => {
  test.setTimeout(150_000);
  const seen = await watchViolations(page);
  await page.goto('/sea/water');
  await waitForScene(page);
  await page.goto('/word/nur');
  await waitForScene(page);
  await expect(page.locator('.save-anchor')).toHaveAttribute('data-visible', 'true', { timeout: 30_000 });
  await page.getByTestId('share-button').click();
  await Promise.all([page.waitForEvent('download'), page.getByTestId('share-download').click()]);
  await page.keyboard.press('Escape');

  await page.getByTestId('mode-toggle').click();
  await expect(page.getByTestId('html-card')).toBeVisible();
  await page.getByTestId('sign-in').click();
  await expect(page.getByTestId('turnstile')).toBeAttached();
  await page.keyboard.press('Escape');

  await page.goto('/');
  await waitForScene(page);
  await page.getByTestId('subscribe-open').click();
  await expect(page.getByTestId('turnstile')).toBeAttached();
  expect(seen).toEqual([]);
});
