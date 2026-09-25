# Durar · Operations

How the live site and the daily email run, where every setting lives, and what to do when
something goes wrong. Secret **values** never go in this file, in chats, or in the repository.

- **Site:** https://durar.space, deployed by Vercel from `main` (project `arabic-lang-project`).
  `www.durar.space` and `arabic-lang-project.vercel.app` redirect to it with a 308.
- **Database and sign-in:** Supabase (project `kjujvlresqniylxhrojo`).
- **Email:** Amazon SES, region **eu-central-1 (Frankfurt)**, domain `durar.space`.
- **DNS:** Namecheap. `hello@durar.space` forwards to the owner through Namecheap Email Forwarding.
- **Scheduler:** Supabase `pg_cron` + `pg_net`. There is no Vercel cron.

## 1. Environment variables

### Vercel → Settings → Environment Variables (Production)

After changing any of these: **Deployments → ⋯ on the latest Production deployment → Redeploy**.
Variables are read when a deployment is built or starts, never live.

| Name | What it does | Type |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Server access to the database (bypasses RLS). | Sensitive |
| `EMAIL_TOKEN_SECRET` | Signs unsubscribe links and hashes IPs for rate limiting. 32+ characters. | Sensitive |
| `CRON_SECRET` | The password pg_cron sends to `/api/cron/daily` and `/api/cron/health`. Must match the Supabase vault secret `durar_cron_secret`. | Sensitive |
| `SES_ACCESS_KEY_ID` | IAM user `durar-email-sender`, send-only policy `DurarSendEmailOnly`. | Sensitive |
| `SES_SECRET_ACCESS_KEY` | Same IAM user. | Sensitive |
| `EMAIL_FROM` | The sender, `Durar <pearl@durar.space>` once the domain is verified in SES. | Plain |
| `EMAIL_REPLY_TO` | Where replies go: `hello@durar.space`. Unset: replies go to the sender. | Plain |
| `EMAIL_MODE` | `sandbox` (default when unset), `live` or `dry-run`. See §5. | Plain |
| `EMAIL_SANDBOX_TO` | Comma-separated addresses that sandbox mode may email. The owner's Gmail. | Plain |
| `EMAIL_SIGNUP` | `on` shows the subscribe button and the account-menu toggle, `off` hides them. **Build-time**: needs a redeploy. The API itself keeps working either way. | Plain |
| `VITE_SUPABASE_URL` | Supabase project URL, for the browser and the server. | Plain |
| `VITE_SUPABASE_ANON_KEY` | Supabase public (anon) key, for the browser. Public by design. | Plain |
| `VITE_CONTACT_EMAIL` | The contact address shown on the Privacy page and in emails. | Plain |
| `VITE_DATA_REGION` | The data region named on the Privacy page. | Plain |

Optional, with working defaults (leave unset unless you mean to change them):

| Name | Default | What it does |
| --- | --- | --- |
| `ALERT_EMAIL` | first `EMAIL_SANDBOX_TO` address | Who the morning health check emails. |
| `SES_REGION` | `eu-central-1` | SES region. |
| `SES_RATE_PER_SECOND` | `1` | Sending pace. Raise to what SES grants after production access (e.g. `10`). |
| `EMAIL_SEND_HOUR` | `7` | Amsterdam hour the daily email goes out. |
| `EMAIL_HEALTH_HOUR` | `8` | Amsterdam hour the health check looks at today's run. |
| `EMAIL_SUBJECT_STYLE` | `b` | Subject line style (a, b or c). |
| `SITE_URL` | Vercel's production URL | Base for links in emails. |

Vercel sets `VERCEL_ENV`, `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL` itself.
`VITE_BACKEND=mock` is only for preview demos; never set it in Production.

### Supabase

| Where | What |
| --- | --- |
| **Vault** (`vault.secrets`) `durar_daily_url` | `https://durar.space/api/cron/daily`. The health job derives its URL from this one. |
| **Vault** `durar_cron_secret` | The same value as `CRON_SECRET` in Vercel. |
| **Authentication → Emails → SMTP Settings** | SES SMTP user name and password (separate from the API keys above), host `email-smtp.eu-central-1.amazonaws.com`, port 587, sender `pearl@durar.space`, name `Durar`. |
| **Authentication → Emails → Templates** | Confirm sign-up and Reset password, pasted from `supabase/auth-templates/`. |
| **Authentication → Sign In / Providers → Email** | **Confirm email** on. |
| **Authentication → URL Configuration** | Site URL `https://durar.space`, redirect URLs for `https://durar.space/**`. |

### AWS

| Where | What |
| --- | --- |
| IAM user `durar-email-sender` | Access key used by Vercel (`SES_*`). Policy `DurarSendEmailOnly` (+ `ses:ListSuppressedDestinations`). |
| SES → SMTP settings | The SMTP credentials used by Supabase Auth (an IAM user named `ses-smtp-user.…`). |
| SES → Identities | `durar.space` (Easy DKIM) and the owner's Gmail address. |

### Namecheap → durar.space → Advanced DNS

The 3 SES DKIM `CNAME` records (`…._domainkey`), DMARC `TXT` at `_dmarc`, Email Forwarding for
`hello@`, and **exactly one** SPF `TXT` record at `@` (Namecheap's forwarding one). Never add a
second `v=spf1` record at `@`.

## 2. The schedule

Both jobs live in Supabase `pg_cron` (Database → Cron, or `select * from cron.job;`).

| Job | Cron (UTC) | Calls | What happens |
| --- | --- | --- | --- |
| `durar-daily-email` | `*/10 5-6 * * *` | `/api/cron/daily` | Every 10 minutes 05:00–06:59 UTC. Only the calls that fall in **07:xx Amsterdam** send (summer and winter); the rest return `outside_send_window`. Each sending call works through up to 45 seconds of recipients; a later call picks up anyone left. Nobody gets two emails on one day. |
| `durar-email-health` | `15 6,7 * * *` | `/api/cron/health` | One of the two calls is **08:15 Amsterdam**; only that one checks. If today's run is missing, stopped with an error, left people waiting, or had failed sends, it emails the owner. |

Set up by `supabase/setup/daily-email-cron.sql` and `supabase/setup/health-check-cron.sql`.

## 3. How to check a run

**The quick way (Supabase → SQL Editor):**

```sql
select run_date, status, sent, failed, remaining, invocations, last_error, finished_at
  from public.daily_runs order by run_date desc limit 7;
```

`status` is `complete` (everyone got it), `had_failures`, `incomplete` (people still waiting after
the last call) or `error` (the last call stopped; `last_error` says why). No row for today after
08:00 means the function never finished a sending call.

**Did the scheduler call the site, and what did it answer?**

```sql
select jobname, status, return_message, start_time
  from cron.job_run_details d join cron.job j using (jobid)
 order by start_time desc limit 20;
select created, status_code, content from net._http_response order by created desc limit 20;
```

`cron.job_run_details` only shows that the SQL ran; `net._http_response` shows what the site
answered (kept for about 6 hours). A `401` there means the vault secret and `CRON_SECRET` differ.

**Who got today's email:**

```sql
select status, count(*) from public.daily_sends where send_date = (now() at time zone 'Europe/Amsterdam')::date group by status;
select status, count(*) from public.subscribers group by status;
```

**From a terminal** (asks for the secret without showing it; nothing is sent by `dry=1`):

```sh
read -rs CRON_SECRET
curl -sS -H "Authorization: Bearer $CRON_SECRET" "https://durar.space/api/cron/health?dry=1"
curl -sS -H "Authorization: Bearer $CRON_SECRET" "https://durar.space/api/cron/daily?dry=1"
```

`?test=1` on the daily route sends today's email to `EMAIL_SANDBOX_TO` only, outside the log.

**Vercel logs:** Vercel → project → **Logs**, filter by `/api/cron/daily`. Send failures log the
subscriber id, never the address.

## 4. Rotating secrets

Do rotations **outside 05:00–07:30 UTC** so no scheduled call lands mid-change.

**`CRON_SECRET`** (the value never needs to leave Supabase and Vercel):
1. Supabase → SQL Editor, make a new random value and store it:
   ```sql
   select vault.update_secret((select id from vault.secrets where name = 'durar_cron_secret'), encode(extensions.gen_random_bytes(32), 'hex'));
   select decrypted_secret from vault.decrypted_secrets where name = 'durar_cron_secret';
   ```
2. Copy the value from the result. Vercel → Environment Variables → `CRON_SECRET` → edit → paste →
   tick **Sensitive** → Save → Redeploy.
3. Check: the old value now gets `401`, and `…/api/cron/health?dry=1` with the new one gets `200`.

**`EMAIL_TOKEN_SECRET`:** rotating it breaks every unsubscribe link in emails already sent (they
show “invalid”). Only rotate it if it leaked. New value: any 48+ random characters, Sensitive, redeploy.

**SES access key** (`SES_ACCESS_KEY_ID` / `SES_SECRET_ACCESS_KEY`): IAM → Users →
`durar-email-sender` → Security credentials → **Create access key** → update both Vercel variables
(Sensitive) → Redeploy → `?test=1` works → back in IAM, **Deactivate** then **Delete** the old key.

**SES SMTP password** (Supabase Auth emails): SES → SMTP settings → Create SMTP credentials →
paste into Supabase SMTP Settings → test a password reset → delete the old IAM SMTP user.

**Supabase service role key:** Supabase → Project Settings → API Keys → roll the key → update
`SUPABASE_SERVICE_ROLE_KEY` in Vercel (Sensitive) → Redeploy.

## 5. Sandbox and live

| `EMAIL_MODE` | Who gets email |
| --- | --- |
| `sandbox` (or unset) | Only addresses in `EMAIL_SANDBOX_TO`, which must also be verified in SES while SES is in its sandbox. Confirmation emails to anyone else are quietly skipped. |
| `live` | Every confirmed subscriber. Needs SES production access. |
| `dry-run` | Nobody. The daily call only counts and renders; the health check is skipped. |

**Going live** (only after SES production access is approved and the inbox test passes):
`EMAIL_MODE=live`, `EMAIL_SIGNUP=on`, optionally `SES_RATE_PER_SECOND` to the granted rate →
Redeploy → `?dry=1` shows `"mode":"live"`.

**Back to sandbox** (e.g. a complaint spike): `EMAIL_MODE=sandbox` and `EMAIL_SIGNUP=off` →
Redeploy. Subscribers stay confirmed; nothing is lost.

## 6. If a morning email doesn't arrive

Work down this list; stop at the first thing that's wrong.

1. **Spam / Promotions** in Gmail. If it's there, mark it *Not spam* and check §7's authentication.
2. **Today's run:** the `daily_runs` query in §3.
   - *No row:* the scheduler didn't reach the site. Check `select * from cron.job;` (both jobs
     `active`), then `net._http_response`. `401` → the vault secret and `CRON_SECRET` differ
     (redo §4 step 1–2 with one value). `404`/`5xx` or a timeout → Vercel logs. A free Supabase
     project can also be **paused**: Supabase dashboard → Restore.
   - *`error`:* read `last_error`. `Supabase … failed` → database or key problem.
     `SES …`/`AccessDenied` → the SES key or its policy.
   - *`had_failures`:* SES refused some sends. Vercel logs show why. Common: sending quota,
     an unverified sender (`EMAIL_FROM` not on a verified identity), or sandbox limits.
   - *`incomplete`:* a call ran out of time and no later call finished the list. Run
     `…/api/cron/daily?force=1` with the secret to send to whoever is left (it never sends twice).
   - *`complete`:* the site handed it to SES. Check SES → **Suppression list** for your address and
     SES → **Account dashboard** for bounces, then Gmail's spam folder again.
3. **Your subscription:** `select status from public.subscribers where email = 'you@…';` must be
   `confirmed`. `bounced` or `complained` stops all email to that address: remove it from SES's
   suppression list first, then set the row back to `confirmed`.
4. **Mode:** in `sandbox`, only `EMAIL_SANDBOX_TO` addresses get anything.
5. **Resend today's email to yourself:** `…/api/cron/daily?test=1` (outside the log).

The health check emails the owner at about 08:15 Amsterdam for everything in step 2, so a quiet
morning with no alert and no email usually means step 1 or 3.

## 7. Email authentication

Gmail → open the email → ⋮ → **Show original**: `SPF`, `DKIM` and `DMARC` should all say `PASS`.
DKIM passes for `durar.space` (the three CNAMEs), DMARC passes through DKIM, and SPF passes for
SES's own envelope domain. DMARC is `p=none` with reports to `hello@durar.space`; tighten it to
`p=quarantine` once the reports have been clean for a few weeks.
