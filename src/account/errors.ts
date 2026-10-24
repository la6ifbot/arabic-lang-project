import { AccountError, type AccountErrorCode } from './types';

const MESSAGES: Record<AccountErrorCode, string> = {
  invalid_credentials: 'That email and password don’t match. Check them and try again.',
  email_not_confirmed: 'Please confirm your email first. The link is in the message we sent you.',
  email_taken: 'That email already has an account. Sign in instead, or reset your password.',
  weak_password: 'Choose a longer password: at least 8 characters, ideally a short phrase.',
  same_password: 'That’s your current password. Choose a new one.',
  email_unavailable: 'Durar can’t send emails just yet, so this step isn’t available right now.',
  invalid_email: 'That email address doesn’t look right.',
  rate_limited: 'Too many attempts just now. Wait a minute, then try again.',
  captcha_failed: 'We couldn’t finish the quick check that keeps bots out. Check your connection, reload the page and try again.',
  network: 'We couldn’t reach the server. Check your connection and try again.',
  limit_reached: 'You’ve reached the limit of saved pearls.',
  name_length: 'Names are 3 to 20 characters long.',
  name_characters: 'Use letters (Latin or Arabic), numbers, spaces, dots, dashes or underscores. No emoji or symbols.',
  name_mixed: 'Use either Latin or Arabic letters in a name, not both.',
  name_reserved: 'That name is reserved. Choose another one, or let us pick one for you.',
  name_not_allowed: 'That name isn’t allowed on The Deep. Choose another one.',
  name_taken: 'Another diver already has that name. Choose another one.',
  rename_too_soon: 'You can change your name once a day. Try again tomorrow.',
  not_configured: 'Accounts aren’t available on this site yet.',
  unknown: 'Something went wrong on our side. Please try again in a moment.',
};

export function friendlyMessage(error: unknown): string {
  return MESSAGES[toAccountError(error).code];
}

export function toAccountError(error: unknown): AccountError {
  if (error instanceof AccountError) return error;
  if (error instanceof TypeError || (error instanceof Error && /fetch|network/i.test(error.message))) {
    return new AccountError('network', error instanceof Error ? error.message : undefined);
  }
  return new AccountError('unknown', error instanceof Error ? error.message : String(error));
}
