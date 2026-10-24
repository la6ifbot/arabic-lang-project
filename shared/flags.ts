/**
 * Email sign-up (Pearl of the Day by email) stays hidden on the production site until the domain
 * exists and email can reach real people. Previews and local builds show it.
 * Domain day: set EMAIL_SIGNUP=on in Vercel (Production) and redeploy.
 */
export function emailSignupFlag(env: Record<string, string | undefined>): boolean {
  const explicit = (env.EMAIL_SIGNUP ?? env.VITE_EMAIL_SIGNUP)?.toLowerCase();
  if (explicit === 'on') return true;
  if (explicit === 'off') return false;
  return env.VERCEL_ENV !== 'production';
}

/**
 * The Deep (the opt-in leaderboard) is parked: off unless VITE_DEEP_ENABLED is on (1, true or on).
 * Off hides every way in, sends /deep to the sea and leaves it out of the weekly digest. Mastery
 * (record_review, verified progress, “Already in the deep”) doesn't depend on it.
 */
export function deepFlag(env: Record<string, string | undefined>): boolean {
  return ['1', 'true', 'on'].includes((env.VITE_DEEP_ENABLED ?? '').trim().toLowerCase());
}
