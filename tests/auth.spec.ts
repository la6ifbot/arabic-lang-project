import { dialog, expect, LAYLA, saveButton, seed, signInViaDialog, status, test, waitForSea } from './accounts';

type Mock = {
  __durarMock: {
    verify(email: string): void;
    link(email: string, kind: 'verify' | 'reset'): string | null;
    failNext(op: string, code?: string): void;
    outbox(): { to: string; kind: string }[];
  };
};

test.describe('accounts: sign up, sign in, sign out', () => {
  test('sign up from a save, confirm the email, sign in: the pearl is saved on the same card', async ({ page }) => {
    await page.goto('/word/hanin');
    await waitForSea(page);
    await saveButton(page).click();
    const d = dialog(page);
    await expect(d).toContainText('Sign in to keep this pearl');
    await d.getByRole('button', { name: 'Create an account' }).click();
    await expect(d.getByRole('heading')).toHaveText('Create your account');
    await d.getByLabel('Email').fill('new.diver@example.com');
    await d.getByLabel('Password', { exact: true }).fill('short');
    await d.getByRole('button', { name: 'Create account' }).click();
    await expect(d.getByRole('alert')).toContainText('at least 8 characters');
    await d.getByLabel('Password', { exact: true }).fill('a sea of words');
    await d.getByRole('button', { name: 'Create account' }).click();
    await expect(d.getByRole('heading')).toHaveText('Check your inbox');
    await expect(d).toContainText('new.diver@example.com');
    expect(await page.evaluate(() => (window as unknown as Mock).__durarMock.outbox())).toContainEqual({ to: 'new.diver@example.com', kind: 'verify' });

    // Signing in before confirming explains what to do.
    await d.getByRole('button', { name: 'Done' }).click();
    await page.getByTestId('sign-in').click();
    await signInViaDialog(page, 'new.diver@example.com', 'a sea of words');
    await expect(dialog(page).getByRole('alert')).toContainText('confirm your email');

    await page.evaluate(() => (window as unknown as Mock).__durarMock.verify('new.diver@example.com'));
    await dialog(page).getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('account-button')).toBeVisible();
    // The word they tried to save before signing up was kept for them.
    await expect(saveButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('focused-word')).toHaveAttribute('data-slug', 'hanin');
  });

  test('the session survives a reload, and signing out is quiet', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('sign-in').click();
    await signInViaDialog(page);
    await expect(page.getByTestId('account-button')).toBeVisible();
    await page.reload();
    await waitForSea(page);
    await expect(page.getByTestId('account-button')).toBeVisible();
    await expect(page.getByTestId('sign-in')).toHaveCount(0);
    await page.getByTestId('account-button').click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByTestId('sign-in')).toBeVisible();
    await expect(status(page)).toContainText('Signed out');
  });

  test('friendly messages for wrong password, taken email and network trouble', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('sign-in').click();
    await signInViaDialog(page, LAYLA.email, 'not-it');
    await expect(dialog(page).getByRole('alert')).toHaveText('That email and password don’t match. Check them and try again.');

    await page.evaluate(() => (window as unknown as Mock).__durarMock.failNext('signIn', 'network'));
    await dialog(page).getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('couldn’t reach the server');

    await dialog(page).getByRole('button', { name: 'Create an account' }).click();
    await dialog(page).getByLabel('Password', { exact: true }).fill('long enough pass');
    await dialog(page).getByRole('button', { name: 'Create account' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('already has an account');

    await dialog(page).getByLabel('Email').fill('not-an-email');
    await dialog(page).getByRole('button', { name: 'Create account' }).click();
    await expect(dialog(page).getByRole('alert')).toHaveText('That email address doesn’t look right.');
  });

  test('forgot password: request a link, open it, choose a new password', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('sign-in').click();
    await dialog(page).getByRole('button', { name: 'Forgot your password?' }).click();
    await expect(dialog(page).getByRole('heading')).toHaveText('Reset your password');
    await dialog(page).getByLabel('Email').fill(LAYLA.email);
    await dialog(page).getByRole('button', { name: 'Send reset link' }).click();
    await expect(dialog(page).getByRole('heading')).toHaveText('Check your inbox');
    expect(await page.evaluate(() => (window as unknown as Mock).__durarMock.outbox())).toContainEqual({ to: LAYLA.email, kind: 'reset' });

    // Opening the emailed link (in this or any other browser) starts a recovery session.
    const link = await page.evaluate((email) => (window as unknown as Mock).__durarMock.link(email, 'reset'), LAYLA.email);
    await page.goto(link!);
    await expect(dialog(page).getByRole('heading')).toHaveText('Choose a new password');
    await expect(dialog(page)).toContainText(`For ${LAYLA.email}.`);
    await expect(page).not.toHaveURL(/token_hash|durar=/);
    await dialog(page).getByLabel('New password').fill('a brand new tide');
    await dialog(page).getByRole('button', { name: 'Save new password' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(status(page)).toContainText('password has been changed');
    // The form doesn't come back once the saved pearls have loaded.
    await page.waitForTimeout(500);
    await expect(dialog(page)).toHaveCount(0);

    await page.getByTestId('account-button').click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.getByTestId('sign-in').click();
    await signInViaDialog(page, LAYLA.email, 'a brand new tide');
    await expect(page.getByTestId('account-button')).toBeVisible();
  });

  test('a confirmation link opened from the email signs in and keeps the pearl', async ({ page }) => {
    await page.goto('/word/hanin');
    await waitForSea(page);
    await saveButton(page).click();
    await dialog(page).getByRole('button', { name: 'Create an account' }).click();
    await dialog(page).getByLabel('Email').fill('new.diver@example.com');
    await dialog(page).getByLabel('Password', { exact: true }).fill('a sea of words');
    await dialog(page).getByRole('button', { name: 'Create account' }).click();
    await expect(dialog(page).getByRole('heading')).toHaveText('Check your inbox');
    const link = await page.evaluate(() => (window as unknown as Mock).__durarMock.link('new.diver@example.com', 'verify'));
    expect(link).toMatch(/^\/\?durar=verify&token_hash=\w+$/);

    await page.goto(link!);
    await expect(dialog(page).getByRole('heading')).toHaveText('Email confirmed');
    await expect(dialog(page)).toContainText('signed in as new.diver@example.com');
    await expect(page).not.toHaveURL(/token_hash|durar=/);
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('account-button')).toBeVisible();
    await expect(page.getByTestId('focused-word')).toHaveAttribute('data-slug', 'hanin');
    await expect(saveButton(page)).toHaveAttribute('aria-pressed', 'true');

    // Opening the same link again while signed in needs no message.
    await page.goto(link!);
    await expect(page.getByTestId('account-button')).toBeVisible();
    await expect(page).not.toHaveURL(/token_hash|durar=/);
    await expect(dialog(page)).toHaveCount(0);
  });

  test('a used reset link says so, and asks for a new one', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('sign-in').click();
    await dialog(page).getByRole('button', { name: 'Forgot your password?' }).click();
    await dialog(page).getByLabel('Email').fill(LAYLA.email);
    await dialog(page).getByRole('button', { name: 'Send reset link' }).click();
    await expect(dialog(page).getByRole('heading')).toHaveText('Check your inbox');
    const first = await page.evaluate((email) => (window as unknown as Mock).__durarMock.link(email, 'reset'), LAYLA.email);
    // Asking again replaces the first link, as with Supabase.
    await dialog(page).getByRole('button', { name: 'Back to sign in' }).click();
    await dialog(page).getByRole('button', { name: 'Forgot your password?' }).click();
    await dialog(page).getByLabel('Email').fill(LAYLA.email);
    await dialog(page).getByRole('button', { name: 'Send reset link' }).click();
    await expect(dialog(page).getByRole('heading')).toHaveText('Check your inbox');

    await page.goto(first!);
    await expect(dialog(page).getByRole('heading')).toHaveText('Reset your password');
    await expect(dialog(page).getByRole('alert')).toContainText('expired or was already used');
    await expect(page).not.toHaveURL(/token_hash|durar=/);
    await expect(page.getByTestId('sign-in')).toBeVisible();
  });

  test('Continue with Google signs in', async ({ page }) => {
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('sign-in').click();
    await dialog(page).getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByTestId('account-button')).toBeVisible();
    await expect(page.getByTestId('account-button')).toHaveAccessibleName(/pearl\.diver@gmail\.com/);
  });

  test('the dialog traps focus, closes on Escape and hands focus back', async ({ page }) => {
    await page.goto('/');
    await waitForSea(page);
    const trigger = page.getByTestId('sign-in');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByLabel('Email')).toBeFocused();
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
    // Arrow keys inside the dialog must not swipe the sea behind it.
    const before = await page.getByTestId('focused-word').getAttribute('data-slug');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('s');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.getByTestId('focused-word').getAttribute('data-slug')).toBe(before);
  });

  test('delete my account removes the account and its pearls', async ({ page }) => {
    await seed(page, { signedIn: true, saved: [{ slug: 'bahr', savedAt: '2026-09-01T10:00:00.000Z' }] });
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('account-button').click();
    await page.getByRole('menuitem', { name: /Delete my account/ }).click();
    const d = dialog(page);
    await expect(d.getByRole('heading')).toHaveText('Delete your account?');
    await expect(d).toContainText('the 1 pearl');
    await expect(d.getByRole('button', { name: 'Keep my account' })).toBeFocused();
    await d.getByRole('button', { name: 'Keep my account' }).click();
    await expect(page.getByTestId('account-button')).toBeVisible();

    await page.getByTestId('account-button').click();
    await page.getByRole('menuitem', { name: /Delete my account/ }).click();
    await dialog(page).getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByTestId('sign-in')).toBeVisible();
    await expect(status(page)).toContainText('deleted');
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem('durar-mock-db')!));
    expect(db.users).toHaveLength(0);
    expect(db.saved).toEqual({});
  });

  test('the privacy page is linked from the sign-in dialog', async ({ page }) => {
    await page.goto('/');
    await waitForSea(page);
    await page.getByTestId('sign-in').click();
    await dialog(page).getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
    await expect(page.getByText('Durar sets no cookies')).toBeVisible();
    await expect(page).toHaveTitle('Privacy · Durar');
  });
});
