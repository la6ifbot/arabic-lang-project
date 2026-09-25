import { test as base, expect, type Page } from '@playwright/test';

/** Tests in this project run against the in-browser mock accounts backend (no network). */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      (window as unknown as { __DURAR_MOCK__: boolean }).__DURAR_MOCK__ = true;
    });
    await use(page);
  },
});
export { expect };

export const LAYLA = { id: 'user-layla', email: 'layla@example.com', password: 'moonlit-harbour', verified: true, provider: 'email' };

export interface SeedProgress {
  slug: string;
  box: number;
  dueAt: string;
  lastReviewedAt: string;
  timesSeen: number;
  lapses: number;
}

interface Seed {
  signedIn?: boolean;
  saved?: { slug: string; savedAt: string }[];
  /** Layla's progress in the (mock) database. */
  progress?: SeedProgress[];
}

/** Seeds the mock database once per test (later reloads keep whatever the test changed). */
export async function seed(page: Page, { signedIn = false, saved = [], progress = [] }: Seed = {}) {
  const db = { users: [LAYLA], sessionUserId: signedIn ? LAYLA.id : null, saved: { [LAYLA.id]: saved }, progress: { [LAYLA.id]: progress }, outbox: [] };
  await page.addInitScript((value) => {
    if (!localStorage.getItem('durar-mock-db')) localStorage.setItem('durar-mock-db', value);
  }, JSON.stringify(db));
}

export const dialog = (page: Page) => page.getByRole('dialog');
export const saveButton = (page: Page) => page.getByTestId('save-button');
export const focusedSlug = (page: Page) => page.getByTestId('focused-word').getAttribute('data-slug');
export const status = (page: Page) => page.getByTestId('account-status');

export async function signInViaDialog(page: Page, email = LAYLA.email, password = LAYLA.password) {
  const d = dialog(page);
  await d.getByLabel('Email').fill(email);
  await d.getByLabel('Password', { exact: true }).fill(password);
  await d.getByRole('button', { name: 'Sign in', exact: true }).click();
}

export async function waitForSea(page: Page) {
  await expect(page.locator('[data-testid=scene] canvas')).toBeVisible();
  // The Save control fades in once the focused pearl has settled.
  await expect(page.locator('.save-anchor')).toHaveAttribute('data-visible', 'true', { timeout: 20_000 });
}

/** Waits until the (mock) server has stored — or dropped — a saved word. */
export async function waitForServer(page: Page, slug: string, saved: boolean) {
  await expect
    .poll(() =>
      page.evaluate(
        ([s]) =>
          Object.values(JSON.parse(localStorage.getItem('durar-mock-db') ?? '{}').saved ?? {})
            .flat()
            .some((p) => (p as { slug: string }).slug === s),
        [slug],
      ),
    )
    .toBe(saved);
}
