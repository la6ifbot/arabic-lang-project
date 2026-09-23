# Setting up accounts (Supabase, Google, Vercel)

This is a one-time setup for the owner, about 30–40 minutes. The code is already in the repo. What's
missing are the accounts and keys only you can create. Do the steps in order.

You'll collect four values along the way:

| Value | Where it comes from | Where it goes |
| --- | --- | --- |
| Supabase project URL | Supabase → Project Settings → API | Vercel env `VITE_SUPABASE_URL` |
| Supabase anon (publishable) key | same page | Vercel env `VITE_SUPABASE_ANON_KEY` |
| Google OAuth client ID + secret | Google Cloud Console | Supabase → Authentication → Providers → Google |
| Your Vercel production URL | Vercel project page | Supabase URL settings, `SITE_URL` (automatic on Vercel) |

---

## 1. Vercel (hosting)

1. Go to <https://vercel.com/new>, sign in with GitHub and import `la6ifbot/arabic-lang-project`.
2. Leave the build settings alone (`vercel.json` sets them) and click **Deploy**.
3. **Production branch:** the repo has no `main` branch yet. Either merge the work into a new
   `main` branch, or set **Settings → Git → Production Branch** to `claude/new-session-id31u5`.
4. Note the production URL, e.g. `https://durar-xyz.vercel.app`. Every other branch and pull
   request gets its own preview URL automatically.

`SITE_URL` needs no setup on Vercel: the build reads `VERCEL_PROJECT_PRODUCTION_URL`, so canonical
links, `og:url` and `sitemap.xml` point at production, even from preview builds.

## 2. Supabase project (database + sign-in)

1. Create a free account at <https://supabase.com> and click **New project**.
2. **Region:** choose **Central EU (Frankfurt)** (`eu-central-1`), or another EU region.
3. Choose a strong database password and store it in a password manager. The site never uses it.
4. When the project is ready, open **SQL Editor** and run the contents of
   [`supabase/migrations/20260924000000_saved_pearls.sql`](../supabase/migrations/20260924000000_saved_pearls.sql).
   It creates the `saved_pearls` table, its Row Level Security policies and the self-service
   account deletion. With the [Supabase CLI](https://supabase.com/docs/guides/cli), running
   `supabase link` then `supabase db push` does the same.
5. **Project Settings → API:** copy the **Project URL** and the **anon / publishable key**. The
   anon key is meant to be public. Row Level Security is what protects the data. **Never** copy
   the `service_role` / secret key anywhere in this project.

### Authentication settings

In **Authentication**:

- **Sign In / Providers → Email:** enabled, with **Confirm email** turned on. Set the minimum
  password length to **8**.
- **URL Configuration:**
  - **Site URL:** your production URL, e.g. `https://durar-xyz.vercel.app`
  - **Redirect URLs** (add each one):
    - `https://durar-xyz.vercel.app/**`
    - `https://*-<your-vercel-team-slug>.vercel.app/**` (preview deployments; the team slug is
      in your Vercel dashboard URL)
    - `http://localhost:5173/**` and `http://localhost:4173/**` (local development)
- **Emails → SMTP Settings:** see step 4. Without it, confirmation and reset emails only reach
  members of your Supabase team.

## 3. Google sign-in

1. Open <https://console.cloud.google.com/> and create a project, e.g. “Durar”.
2. **APIs & Services → OAuth consent screen** (on newer consoles: **Google Auth Platform →
   Branding**): user type **External**, app name **Durar**, your support email. Add
   `<your-project-ref>.supabase.co` under authorized domains. The only scopes needed are `openid`,
   `email` and `profile`, which need no Google review.
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   - **Authorized JavaScript origins:** your production URL (`https://durar-xyz.vercel.app`) and
     `http://localhost:5173`.
   - **Authorized redirect URIs:** exactly
     `https://<your-project-ref>.supabase.co/auth/v1/callback`
     (Supabase shows this under Authentication → Providers → Google as the “Callback URL”).
4. Copy the **Client ID** and **Client secret** into **Supabase → Authentication → Providers →
   Google**, enable it and save.
5. Publish the consent screen (**Audience → Publish app**) so people outside your Google
   account's test-user list can sign in.

Google sends visitors back to Supabase, and Supabase sends them back to Durar using the redirect
URLs from step 2. That's why the Vercel and localhost URLs go in Supabase, not in Google.

## 4. Email delivery (needed before real people sign up)

Supabase's built-in mailer is for testing. It only sends to members of your Supabase team, and
at most **2 emails per hour**. For real sign-ups and password resets, add custom SMTP:

- Recommended: **Resend** (the email provider already planned for Phase 0.3). The free tier
  (3,000 emails a month) is plenty at launch. Verify a sending domain in Resend, then enter its SMTP
  details in **Supabase → Authentication → Emails → SMTP Settings**.
- After that, Supabase allows 30 auth emails an hour by default, adjustable under
  **Authentication → Rate Limits**.

This needs a domain you control for the sender address. If you don't have one yet, add it together
with the custom-domain step below.

## 5. Connect Vercel to Supabase

In **Vercel → Project → Settings → Environment Variables**, add the following for both
**Production** and **Preview**:

```
VITE_SUPABASE_URL        = https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY   = <anon / publishable key>
VITE_DATA_REGION         = Frankfurt, Germany (EU)      # shown on the Privacy page
VITE_CONTACT_EMAIL       = <an address for privacy questions>
```

Then **Deployments → ⋯ → Redeploy**. The Sign in button appears once these are set. Without them,
the site still works, just without accounts.

For local development, copy `.env.example` to `.env.local` and fill in the same values.

## 6. Check it works

- Open the production URL, press **S** or tap the pearl on a card, create an account, confirm the
  email, and check the word appears in **My Pearls**.
- Open `/sitemap.xml` and a word page's source (`/word/bahr`) and check the canonical and
  `og:url` tags show your production URL.
- Open a preview deployment (any branch or PR) and sign in there too. If Supabase rejects the
  redirect, the preview wildcard in step 2 is missing or has the wrong team slug.

## If you add a custom domain later

Update, in this order: Vercel domain → Supabase **Site URL** and **Redirect URLs** → Google
**Authorized JavaScript origins**. Nothing in the code changes.

## Free-tier notes

- **Pausing:** Supabase pauses free projects that get too little activity over 7 days. While
  paused, sign-in and saving stop working, but browsing still works because the words are static.
  Restore it from the Supabase dashboard (possible for 90 days). To prevent pausing entirely,
  upgrade to Pro (a paid plan, your call).
- **Limits** that matter at this size: 500 MB database (each saved pearl is a few dozen bytes),
  50,000 monthly active users, and the email limits above. The database also caps each account
  at 1,000 saved pearls.
