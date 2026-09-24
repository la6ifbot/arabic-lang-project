import { expect, test } from 'vitest';
import { emailSignupFlag } from '../../shared/flags';

test('email sign-up is hidden on the production site until switched on', () => {
  expect(emailSignupFlag({ VERCEL_ENV: 'production' })).toBe(false);
  expect(emailSignupFlag({ VERCEL_ENV: 'production', EMAIL_SIGNUP: 'on' })).toBe(true);
  expect(emailSignupFlag({ VERCEL_ENV: 'preview' })).toBe(true);
  expect(emailSignupFlag({})).toBe(true); // local development
  expect(emailSignupFlag({ EMAIL_SIGNUP: 'off' })).toBe(false);
});
