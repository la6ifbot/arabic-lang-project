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
  network: 'We couldn’t reach the server. Check your connection and try again.',
  limit_reached: 'You’ve reached the limit of saved pearls.',
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
