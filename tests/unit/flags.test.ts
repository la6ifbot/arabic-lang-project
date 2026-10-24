import { expect, test } from 'vitest';
import { deepFlag, emailSignupFlag } from '../../shared/flags';

test('email sign-up is hidden on the production site until switched on', () => {
  expect(emailSignupFlag({ VERCEL_ENV: 'production' })).toBe(false);
  expect(emailSignupFlag({ VERCEL_ENV: 'production', EMAIL_SIGNUP: 'on' })).toBe(true);
  expect(emailSignupFlag({ VERCEL_ENV: 'preview' })).toBe(true);
  expect(emailSignupFlag({})).toBe(true); // local development
  expect(emailSignupFlag({ EMAIL_SIGNUP: 'off' })).toBe(false);
});

test('The Deep is off unless VITE_DEEP_ENABLED switches it on', () => {
  expect(deepFlag({})).toBe(false);
  expect(deepFlag({ VERCEL_ENV: 'preview' })).toBe(false);
  expect(deepFlag({ VITE_DEEP_ENABLED: 'false' })).toBe(false);
  for (const on of ['1', 'true', 'on', 'TRUE']) expect(deepFlag({ VITE_DEEP_ENABLED: on })).toBe(true);
});
