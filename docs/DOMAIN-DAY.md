# Domain day: durar.space

Do the parts in order. Parts 1–3 can be done today. Part 4 waits for AWS to approve production access
(usually within 24 hours). Parts 5–6 come after that.

**Keep `EMAIL_SIGNUP` unset (off)** until Part 4 is approved and a test email has landed in your
inbox (Part 7).

Namecheap's **Host** field takes only the part *before* `durar.space`. So `mail.durar.space` is
entered as `mail`, and the domain itself as `@`. Namecheap adds `.durar.space` for you. If you paste
a full name, you get `mail.durar.space.durar.space`, which doesn't work.

---

## Part 1 · Vercel: make durar.space the address

1. Vercel → `arabic-lang-project` → **Settings → Domains**.
2. Next to **durar.space**, open **Edit** and make sure it's **not** redirecting anywhere (it serves Production).
3. Next to **www.durar.space**, choose **Edit → Redirect to `durar.space`** (308) → Save. One address
   means one canonical, which matters for search engines. (The site's `vercel.json` also sends
   `www.durar.space` and `arabic-lang-project.vercel.app` to `durar.space` with a permanent 308, so
   both are covered even if this setting is missed. Only `/api/…` is left alone there, so an older
   scheduler address keeps working. Preview addresses are not redirected.)
4. **Settings → Environment Variables → Add**:
   - `SITE_URL` = `https://durar.space`, ticking **Production** and **Preview** (previews should
     also point canonicals and email links at the real site).
   - Change `VITE_CONTACT_EMAIL` to the address you'll use for contact (for example
     `hello@durar.space`, *if* you set up forwarding for it; see the note in Part 3), or leave it as it is.
5. **Deployments → latest Production → ⋯ → Redeploy**.
6. Check: open `https://durar.space/word/bahr` → right-click → **View Page Source** → search for
   `canonical`. It should say `https://durar.space/word/bahr`. `https://durar.space/sitemap.xml`
   should list `https://durar.space/…` addresses.

## Part 2 · Supabase: Site URL and redirects

1. Supabase → your project → **Authentication → URL Configuration**.
2. **Site URL**: `https://durar.space` → **Save**.
3. **Redirect URLs → Add URL**, one at a time:
   - `https://durar.space/**`
   - `https://www.durar.space/**`
4. Keep the existing ones (`https://arabic-lang-project.vercel.app/**`, `https://*-la6ifbot.vercel.app/**`,
   `http://localhost:5173/**`). Previews and local development still need them.
5. **Save**.

## Part 3 · Google sign-in

**Branding** (Google Cloud Console → your *Durar* project → **Google Auth Platform → Branding**):
1. **Application home page**: `https://durar.space`
2. **Application privacy policy link**: `https://durar.space/privacy`
3. **Authorized domains** → **Add domain** → `durar.space`. Keep `kjujvlresqniylxhrojo.supabase.co`.
4. **Save**.

**Client** (**Google Auth Platform → Clients → Durar web**):
1. **Authorized JavaScript origins → Add URI**: `https://durar.space`, then `https://www.durar.space`.
   Keep the others.
2. **Authorized redirect URIs**: unchanged (`https://kjujvlresqniylxhrojo.supabase.co/auth/v1/callback`).
3. **Save**. Changes can take a few minutes.

**Showing “Durar” instead of the supabase.co address (brand verification, optional):**
1. Prove you own the domain: open <https://search.google.com/search-console> → **Add property →
   Domain** → `durar.space`. Google shows a TXT value (`google-site-verification=…`).
2. Namecheap → **Domain List → durar.space → Manage → Advanced DNS → Add New Record** →
   **TXT Record**, Host `@`, Value = that text → ✓. Back in Search Console → **Verify**.
3. Google Auth Platform → **Branding**: upload the logo (a 120×120 px square), save, then
   **Verification Center → Submit for verification**. It usually takes a few days.

> **Email for `hello@durar.space`:** Namecheap's free **Email Forwarding** can forward it to your
> inbox. It lives under **Advanced DNS → Mail Settings**. Part 4's MAIL FROM step asks you to switch
> *Mail Settings* to **Custom MX**, and that turns forwarding off. If you want both, use Custom MX and
> add forwarding somewhere else (e.g. ImprovMX, free), or skip the optional MAIL FROM step:
> deliverability is fine without it, because DKIM keeps DMARC passing.

## Part 4 · Amazon SES: verify durar.space

Make sure the region at the top right is **Europe (Frankfurt) eu-central-1** for every step.

### 4a · Create the domain identity (DKIM)
1. AWS console → **Amazon SES → Configuration → Identities → Create identity**.
2. **Identity type: Domain** → Domain: `durar.space`.
3. Tick **Assign a default configuration set**? → **No**, leave it unticked (so there's no tracking).
4. Tick **Use a custom MAIL FROM domain** → MAIL FROM domain: `mail` (it shows `mail.durar.space`) →
   **Behavior on MX failure: Use default MAIL FROM domain**.
5. **Advanced DKIM settings: Easy DKIM**, **RSA_2048_BIT**, **DKIM signatures: Enabled**.
6. **Create identity**. SES now lists **3 CNAME records** under *DomainKeys Identified Mail (DKIM)*
   and **MX + TXT** records under *Custom MAIL FROM domain*. Keep that page open.

### 4b · Add the records at Namecheap
Namecheap → **Domain List → durar.space → Manage → Advanced DNS**.

**DKIM: three CNAME records.** For each of the 3 rows SES shows, click **Add New Record →
CNAME Record**:

| Type | Host (Namecheap) | Value | TTL |
| --- | --- | --- | --- |
| CNAME | `abc123…_domainkey` | `abc123….dkim.amazonses.com` | Automatic |

SES shows the name as `abc123…._domainkey.durar.space`. In Namecheap's Host field, type
**only** `abc123…._domainkey` (delete `.durar.space`). The Value is pasted as shown. Repeat for all 3.

**Custom MAIL FROM (`mail.durar.space`, optional; see the note in Part 3):**
1. Still in Advanced DNS, scroll to **Mail Settings** → choose **Custom MX**.
2. **Add New Record** under Mail Settings:

| Type | Host | Value | Priority |
| --- | --- | --- | --- |
| MX | `mail` | `feedback-smtp.eu-central-1.amazonses.com` | `10` |

3. In **Host Records → Add New Record**:

| Type | Host | Value |
| --- | --- | --- |
| TXT | `mail` | `v=spf1 include:amazonses.com ~all` |

**SPF for the domain itself.** Nothing is needed for SES. SES sends with the `mail.durar.space`
envelope, and the TXT above covers it. If Namecheap already has a TXT record on `@` starting with
`v=spf1` (for example from email forwarding), leave it alone. A domain may have only one SPF record.

**DMARC: one TXT record** (Host Records → Add New Record):

| Type | Host | Value |
| --- | --- | --- |
| TXT | `_dmarc` | `v=DMARC1; p=none; adkim=r; aspf=r; rua=mailto:YOUR-ADDRESS` |

Replace `YOUR-ADDRESS` with an inbox you read. It gets daily DMARC reports. If that inbox isn't on
`durar.space`, some providers skip the reports; that's harmless. Or remove the `; rua=…` part
entirely. After a few clean weeks you can tighten `p=none` to `p=quarantine`.

Click the ✓ on every row to save it.

### 4c · Wait for verification
Back in SES → **Identities → durar.space**. Within minutes to an hour, **DKIM configuration** turns
**Successful** and **Custom MAIL FROM** turns **Successful**. The identity status becomes
**Verified**. If it's still pending after a few hours, check the Host fields for a doubled `.durar.space`.

### 4d · Request production access (leave the sandbox)
1. SES → **Account dashboard** → **Request production access** (or **Get set up → Request production access**).
2. **Mail type: Marketing** (a daily, opt-in newsletter counts as marketing to AWS).
3. **Website URL**: `https://durar.space`
4. **Use case description** (paste and adjust):

   > Durar (https://durar.space) is a small, free website for people who love Arabic words. Visitors
   > can subscribe to the “Pearl of the Day”: one email per day with a single Arabic word, its meaning
   > and an example sentence. We send only to subscribers who confirmed through double opt-in (a
   > confirmation link sent on sign-up); unconfirmed sign-ups are deleted after 7 days. Every email has
   > a visible unsubscribe link plus List-Unsubscribe and List-Unsubscribe-Post (RFC 8058 one-click)
   > headers. We read the SES account suppression list every day and never email bounced or
   > complaining addresses again. We don't buy or import lists and don't use open or click tracking.
   > Expected volume at launch: under 100 emails a day, growing slowly; sending is spread over one
   > hour each morning (07:00–08:00 Europe/Amsterdam). The sending domain durar.space has DKIM, a
   > custom MAIL FROM domain with SPF, and DMARC. Email is also used for account confirmation and
   > password-reset messages (via Supabase Auth SMTP).

5. **Additional contacts**: your email. **Preferred language**: English. Tick the acknowledgement → **Submit**.
6. AWS replies by email, usually within 24 hours. Answer any follow-up questions the same way.

### 4e · Let the sending key send from the domain
Your IAM user's `DurarSendEmailOnly` policy already allows `SendEmail`/`SendRawEmail` on all
resources, so nothing needs changing. (Optionally add `ses:ListSuppressedDestinations` now: see
`EMAIL-SETUP.md` §1.)

## Part 5 · Supabase custom SMTP through SES (after 4c is Verified)

This works while still in the sandbox, but sign-up emails only reach addresses verified in SES
until 4d is approved. Do the final switch-over after approval.

1. AWS → **SES → SMTP settings** (left menu) → note the **SMTP endpoint**:
   `email-smtp.eu-central-1.amazonaws.com`, port **587** (STARTTLS).
2. **Create SMTP credentials** → leave the suggested user name → **Create user** → **copy the SMTP
   user name and SMTP password** (shown once). These are *not* the access keys from Part 4 of your
   setup guide. Don't paste them into a chat.
3. Supabase → **Authentication → Emails → SMTP Settings** → **Enable Custom SMTP**:
   - **Sender email**: `hello@durar.space` (any address at durar.space works for sending, because the domain is verified)
   - **Sender name**: `Durar`
   - **Host**: `email-smtp.eu-central-1.amazonaws.com`
   - **Port number**: `587`
   - **Minimum interval between emails** per user: leave the default (60 seconds)
   - **Username** / **Password**: the SMTP credentials from step 2
   - **Save**.
4. **Authentication → Rate Limits → Rate limit for sending emails**: raise from 30 to e.g. `100` per
   hour (production access allows far more) → Save.
5. Test: on `https://durar.space`, **Sign in → Forgot your password?** with your own account's
   address. The reset email should arrive from Durar within a minute. (In the sandbox, only if that
   address is verified in SES.)

## Part 6 · Turn “Confirm email” back on (after Part 5's test works)

1. Supabase → **Authentication → Sign In / Providers → Email**.
2. Switch **Confirm email** **on** → **Save**.
3. Check it on `https://durar.space`: sign out, **Sign in → Create an account** with a fresh address
   you can read. The site should say **Check your inbox**, and the email's link should bring you
   back signed in. No code change is needed: the site switches back to the confirmation flow by itself.

Accounts created while confirmation was off stay as they are.

## Part 7 · The daily email, then going live

1. Vercel → Environment Variables (Production + Preview):
   - `EMAIL_FROM` = `Durar <pearls@durar.space>`
   - Delete `EMAIL_SUBJECT_STYLE` if you added it. **b** is now the default (“Pearl of the Day: سَرَاب (sarāb)”).
   - Keep `EMAIL_MODE` = `sandbox` for now, and `EMAIL_SANDBOX_TO` = your address.
   - **Don't** add `EMAIL_SIGNUP` yet.
   → **Redeploy**.
2. Supabase **SQL Editor**, pointing the scheduler at the domain (if you already ran the pg_cron setup):
   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'durar_daily_url'),
     'https://durar.space/api/cron/daily'
   );
   ```
   (Haven't run it yet? Run `supabase/setup/daily-email-cron.sql`; it now uses `durar.space`.)
3. Send yourself a test:
   `curl -H "Authorization: Bearer <CRON_SECRET>" "https://durar.space/api/cron/daily?test=1"`
   It should land in your **inbox** (not spam) from `pearls@durar.space`. Check it in Gmail
   web/iOS/Android (also dark mode), Apple Mail and Outlook (checklist: `EMAIL-SETUP.md` §5).
4. **Only when production access is approved *and* that test landed in the inbox:**
   - `EMAIL_MODE` = `live`
   - `EMAIL_SIGNUP` = `on` (Production)
   - `VITE_CONTACT_EMAIL` = your final contact address, if it changed
   → **Redeploy**. The sign-up link and the account-menu toggle appear on durar.space, and the next
   07:00–08:00 Amsterdam window sends to everyone who has confirmed.
