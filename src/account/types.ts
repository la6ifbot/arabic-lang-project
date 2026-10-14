import type { Direction, Progress } from '../../shared/mastery';

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
  | 'captcha_failed'
  | 'network'
  | 'limit_reached'
  | 'name_length'
  | 'name_characters'
  | 'name_mixed'
  | 'name_reserved'
  | 'name_not_allowed'
  | 'name_taken'
  | 'rename_too_soon'
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
  // `captchaToken`: a Turnstile token, required by Supabase once its CAPTCHA protection is on.
  signUp(email: string, password: string, returnTo: string, captchaToken?: string | null): Promise<{ needsVerification: boolean }>;
  signIn(email: string, password: string, captchaToken?: string | null): Promise<AccountUser>;
  signInWithGoogle(returnTo: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string, returnTo: string, captchaToken?: string | null): Promise<void>;
  updatePassword(password: string): Promise<void>;
  /** Remembers the chosen sea topic (null: the whole sea) on the account. */
  setTopic(topic: string | null): Promise<void>;
  resendVerification(email: string, returnTo: string, captchaToken?: string | null): Promise<void>;
  listSaved(): Promise<SavedPearl[]>;
  /** Idempotent. `savedAt` restores the original date when undoing a removal. */
  save(slug: string, savedAt?: string): Promise<void>;
  unsave(slug: string): Promise<void>;
  /** Mastery progress of the signed-in user. */
  listProgress(): Promise<Progress[]>;
  /** The sign-in merge of browser progress: for each word the latest review wins. It never counts on The Deep. */
  saveProgress(rows: Progress[]): Promise<void>;
  /** Swipes, in order, judged by the server (record_reviews()); returns each word as the server now has it. */
  recordReviews(reviews: { slug: string; dir: Direction }[]): Promise<Progress[]>;
  /** The Deep: both boards' top 10, readable signed out too. */
  deepBoards(): Promise<DeepBoards>;
  /** The signed-in user's entry and ranks, or null when they haven't joined. */
  deepMe(): Promise<DeepMe | null>;
  /** Joins with a chosen name, or with a generated one when `name` is null. */
  deepJoin(name: string | null, script: DeepScript): Promise<DeepMe>;
  deepRename(name: string | null, script: DeepScript): Promise<DeepMe>;
  deepLeave(): Promise<void>;
  /** Deletes all of the signed-in user's progress. Saved pearls stay. */
  resetProgress(): Promise<void>;
  /** Everything Durar keeps about the signed-in user, for “Download my data” (export_my_data()). */
  exportMyData(): Promise<MyData>;
  /** Permanently deletes the signed-in user and everything they saved. */
  deleteAccount(): Promise<void>;
  /** The current session's access token, for calls to our own server. */
  accessToken(): Promise<string | null>;
  /** The signed-in user's Pearl of the Day email subscription. */
  getSubscription(): Promise<SubscriptionStatus>;
  unsubscribeMe(): Promise<void>;
}

export type SubscriptionStatus = 'none' | 'pending' | 'confirmed' | 'unsubscribed' | 'bounced' | 'complained';

/** “Download my data”: the same shape from Supabase (export_my_data()) and the mock. */
export interface MyData {
  account: { email: string | null; created_at: string | null; sign_in_method: string; sea_topic?: string | null };
  saved_pearls: { word: string; saved_at: string }[];
  progress: { word: string; box: number; due_at: string; last_reviewed_at: string; times_seen: number; lapses: number }[];
  email_subscription: { email: string; status: string; subscribed_at: string | null; confirmed_at: string | null; unsubscribed_at: string | null } | null;
  /** The Deep (leaderboard) entry; null when not joined. */
  the_deep: unknown;
}

export type DeepScript = 'latin' | 'arabic';
export type BoardId = 'week' | 'all';

export interface BoardRow {
  rank: number;
  name: string;
  /** Depth gained this week (week) or total depth (all). */
  score: number;
  /** Pearls in the deep (all time only). */
  pearls: number | null;
}

export interface DeepBoards {
  week: { rows: BoardRow[]; divers: number };
  all: { rows: BoardRow[]; divers: number };
  refreshedAt: string | null;
}

export interface DeepMe {
  name: string;
  generated: boolean;
  joinedAt: string;
  /** When a rename is possible again; null when it is now. */
  nextRenameAt: string | null;
  /** The score right now (the boards catch up within 15 minutes). */
  live: { depth: number; pearls: number; week: number };
  all: { rank: number; score: number; pearls: number | null } | null;
  week: { rank: number; score: number } | null;
}
