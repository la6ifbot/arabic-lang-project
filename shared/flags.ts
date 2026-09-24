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
