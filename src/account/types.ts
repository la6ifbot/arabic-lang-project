import type { Progress } from '../../shared/mastery';

export interface AccountUser {
  id: string;
  email: string | null;
  /** "email" or "google". */
  provider: string;
  /** The sea topic chosen on any device (a profile preference): null is the whole sea; absent, never chosen. */
  topic?: string | null;
}

export interface SavedPearl {
  slug: string;
  /** ISO timestamp. */
  savedAt: string;
}

export type AuthChange = 'signed-in' | 'signed-out' | 'password-recovery';

/** Something the auth redirect left in the URL that the UI should explain. */
export type UrlNotice =
  | 'verified'
  | 'verified-sign-in'
  | 'verify-link-invalid'
  | 'reset-link-invalid'
  | 'link-offline'
  | 'oauth-failed'
  | 'recovery';

/** What checking a link from one of our auth emails gave. */
export type EmailLinkResult = 'ok' | 'failed' | 'offline';

export type AccountErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_taken'
  | 'weak_password'
  | 'same_password'
  | 'email_unavailable'
  | 'invalid_email'
  | 'rate_limited'
  | 'network'
  | 'limit_reached'
  | 'not_configured'
  | 'unknown';

export class AccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AccountError';
  }
}

/**
 * Everything the UI needs from an accounts service. Implemented by Supabase in production and by an
 * in-browser mock for tests and offline previews.
 */
export interface Backend {
  readonly kind: 'supabase' | 'mock';
  /** Restores the session (and completes any auth redirect sitting in the URL). */
  init(): Promise<{ user: AccountUser | null; notice?: UrlNotice }>;
  onChange(cb: (change: AuthChange, user: AccountUser | null) => void): () => void;
  signUp(email: string, password: string, returnTo: string): Promise<{ needsVerification: boolean }>;
  signIn(email: string, password: string): Promise<AccountUser>;
  signInWithGoogle(returnTo: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string, returnTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  /** Remembers the chosen sea topic (null: the whole sea) on the account. */
  setTopic(topic: string | null): Promise<void>;
  resendVerification(email: string, returnTo: string): Promise<void>;
  listSaved(): Promise<SavedPearl[]>;
  /** Idempotent. `savedAt` restores the original date when undoing a removal. */
  save(slug: string, savedAt?: string): Promise<void>;
  unsave(slug: string): Promise<void>;
  /** Mastery progress of the signed-in user. */
  listProgress(): Promise<Progress[]>;
  /** Upserts; for each word the latest review wins (on the server too), so retries are safe. */
  saveProgress(rows: Progress[]): Promise<void>;
  /** Deletes all of the signed-in user's progress. Saved pearls stay. */
  resetProgress(): Promise<void>;
  /** Permanently deletes the signed-in user and everything they saved. */
  deleteAccount(): Promise<void>;
  /** The current session's access token, for calls to our own server. */
  accessToken(): Promise<string | null>;
  /** The signed-in user's Pearl of the Day email subscription. */
  getSubscription(): Promise<SubscriptionStatus>;
  unsubscribeMe(): Promise<void>;
}

export type SubscriptionStatus = 'none' | 'pending' | 'confirmed' | 'unsubscribed' | 'bounced' | 'complained';
