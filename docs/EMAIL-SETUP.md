# Setting up the Pearl of the Day email

This continues your setup guide's Part 4 (Amazon SES). Until the domain exists, everything runs in
**sandbox mode**: the daily email only reaches the address(es) you list in `EMAIL_SANDBOX_TO`, which
must be verified in SES. Going live on domain day means changing configuration, not code (see the
end of this page).

## 1. Amazon SES (Frankfurt)

Follow Part 4 of your guide (verify your address, create the `durar-email-sender` IAM user and its
access key). One optional extra: add **`ses:ListSuppressedDestinations`** to the
`DurarSendEmailOnly` policy. The daily job uses it to read SES's bounce/complaint list and stop
emailing those addresses in our database too. Without it, SES still refuses to send to them; we just
can't mark them.

Don't attach a *configuration set* with open/click tracking to your identity. Durar sends without
any configuration set, so no tracking is applied.

## 2. Vercel environment variables (server-side)

Vercel → `arabic-lang-project` → **Settings → Environment Variables**. None of these start with
`VITE_`, so none of them ever reach the browser. Tick **Production** and **Preview** for each.

| Name | Value | Secret? |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → **service_role** (legacy) or **secret** key. The Vercel↔Supabase integration may already have created this one; if so, leave it. | **yes** |
| `SUPABASE_URL` | `https://kjujvlresqniylxhrojo.supabase.co` (the integration may have created it too) | no |
| `SES_ACCESS_KEY_ID` | the IAM user's Access key ID | **yes** |
| `SES_SECRET_ACCESS_KEY` | the IAM user's Secret access key | **yes** |
| `SES_REGION` | `eu-central-1` | no |
| `EMAIL_FROM` | `Durar <your-verified-address@example.com>` (until domain day, the address you verified in SES) | no |
| `EMAIL_MODE` | `sandbox` | no |
| `EMAIL_SANDBOX_TO` | your verified address (comma-separate more than one) | no |
| `EMAIL_TOKEN_SECRET` | a long random string (see below). Signs unsubscribe links and hashes IPs. | **yes** |
| `CRON_SECRET` | another long random string. The scheduler sends it to prove it's allowed to trigger the daily email. | **yes** |
| `EMAIL_SUBJECT_STYLE` | `a`, `b` or `c` (see the subject lines in the Phase 0.3 report; default `a`) | no |

Random strings: in a terminal, `openssl rand -base64 36`, once for each secret. Don't reuse
`EMAIL_TOKEN_SECRET`: changing it later invalidates the unsubscribe links in emails already sent.

The Privacy-page contact (`VITE_CONTACT_EMAIL`) is also used in email footers. There's nothing extra
to add for it.

Then **redeploy**.

## 3. Database

Supabase → **SQL Editor**: run `supabase/migrations/20260925000000_pearl_of_the_day.sql`, the same
way you ran the first migration. It creates the subscriber tables and functions, and updates
account deletion so it also removes a subscription.

## 4. Schedule the daily run (Supabase pg_cron)

1. Supabase → **Database → Extensions**: enable **pg_cron** and **pg_net**.
2. **SQL Editor**: open `supabase/setup/daily-email-cron.sql`, replace
   `REPLACE-WITH-THE-CRON_SECRET-VALUE` with your `CRON_SECRET`, and run it.

It calls the site every 10 minutes between 05:00 and 06:59 UTC. Only the calls that land in
07:00–07:59 Amsterdam time send anything, in batches, so summer and winter time are both covered
with no changes.

## 5. Try it

- **See the email without sending anything:** `npm run email:render`, then open `dist-email/daily.html`.
- **Send today's email to yourself now:** in a terminal (replace the secret):
  `curl -H "Authorization: Bearer <CRON_SECRET>" "https://arabic-lang-project.vercel.app/api/cron/daily?test=1"`
  (or, with the same variables in `.env.local`, `npm run email:test`). Test sends aren't logged, so
  they never stop the real morning email.
- **Count tomorrow's recipients:** the same URL with `?dry=1`.
- **Subscribe for real (preview deployments only, until domain day):** open a preview URL, click
  “Get the Pearl of the Day by email”, use your verified address, confirm from the email, and wait
  for 07:00 (or use `?force=1` with the curl command above).

### What to check in each email client

Send one test with `?test=1`, then open it in **Gmail web**, **Gmail iOS**, **Gmail Android**
(also in **dark mode**), **Apple Mail** and **Outlook**, and check:
- The Arabic example reads right to left, and the letters join.
- With images turned off, the word still reads (alt text) and so does everything below it.
- **Open in Durar** opens the word's page. **Unsubscribe** opens the unsubscribe page and works.
- Gmail and Apple Mail show their own “Unsubscribe” link near the sender (from the one-click
  headers). It may only appear once the domain has DKIM set up.

## Domain day (no code changes)

1. SES: verify the domain (DKIM, SPF and DMARC records in DNS) and request **production access**.
2. Vercel: `EMAIL_FROM=Durar <pearls@yourdomain>`, `EMAIL_MODE=live`, and **`EMAIL_SIGNUP=on`**
   (Production), which reveals the sign-up link and the account-menu toggle on the live site.
   `VITE_CONTACT_EMAIL=hello@yourdomain`. Redeploy.
3. Supabase pg_cron: point the job at the new domain (the command is at the bottom of
   `daily-email-cron.sql`).
4. Supabase Auth → SMTP settings → SES SMTP credentials; turn **Confirm email** back on. The site
   switches back to the full confirmation and reset flows automatically.
