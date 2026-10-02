/** Browser-storage keys used by accounts (all strictly necessary; see the Privacy page). */
export const SESSION_STORAGE_KEY = 'durar-auth'; // Supabase session
export const MOCK_DB_KEY = 'durar-mock-db'; // mock backend (tests / offline preview only)
export const PENDING_SAVE_KEY = 'durar-pending-save'; // a pearl waiting for sign-in to finish
export const MOCK_EMAIL_KEY = 'durar-mock-email'; // mock email subscriptions (tests / offline preview only)
export const PROGRESS_KEY = 'durar-progress'; // mastery progress while signed out (merged into the account on sign-in)
export const PROGRESS_OUTBOX_KEY = 'durar-progress-outbox'; // signed-in progress not yet saved (e.g. offline)
export const SEA_DEPTH_KEY = 'durar-sea-depth'; // last visit's sea depth, so it never jumps at load
export const HELP_SEEN_KEY = 'durar-help-seen'; // “How it works” has been shown once, so it doesn't open by itself again
