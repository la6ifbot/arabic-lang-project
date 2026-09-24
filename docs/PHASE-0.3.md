# Phase 0.3 — Pearl of the Day: report

Live: https://arabic-lang-project.vercel.app (deploys from `claude/new-session-id31u5` until the
production branch is switched).
Preview with browser-only demo accounts: https://claude.ai/artifact/A71zLZPK1zRW3nWbferAHZ

Legend: **[x]** done and verified · **[~]** built, waiting on the owner or on something I can't reach
from here · **[ ]** not done

> **Two things I couldn't do from this environment.** (1) Its network policy blocks
> `arabic-lang-project.vercel.app`, so I couldn't check the live site or run Lighthouse against it.
> (2) Pushing a new `main` branch was refused by this session's permissions. Both are listed
> under “Needs your input”.

## Checklist

### A. Carry-over & housekeeping
- [~] **`main` branch.** Not created: this session isn't allowed to push a branch other than `claude/new-session-id31u5`. Once you create `main` from this branch (one click on GitHub, or tell me to try again once you've allowed it), set Vercel's production branch to it (your guide, Part 5).
- [~] **Live verification** of sign-up, Google, save, Library, delete account and the Privacy contact: blocked, because this environment can't reach `vercel.app`. The same flows are covered by 63 Playwright tests against the production build.
- [~] **Live SEO and Lighthouse:** blocked for the same reason. The build tests check sitemap, `robots.txt`, canonical, `og:url` and the new `og:image` tags. Lighthouse against the production build locally is below.
- [x] **Env var names:** the site reads only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CONTACT_EMAIL`, `VITE_DATA_REGION` and `VITE_EMAIL_SIGNUP`. Vite only exposes `VITE_*` variables to the browser, so the integration's `NEXT_PUBLIC_*`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_*` etc. can never reach it. The server reads the service key as `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`), matching the integration's names.
- [x] **Interim sign-up:** with “Confirm email” off, Supabase returns a session. The sheet closes, you're signed in (“Welcome to Durar. You're signed in.”) and any waiting pearl is saved (tested).
- [x] **Interim password reset:** when Supabase can't send the email (`email_address_not_authorized`, or “Error sending … email”), the sheet says *“Durar can't send emails just yet…”*, suggests Continue with Google (with the button right there), and shows the Privacy contact address when it's set. No raw errors (tested).
- [x] **Switches back by itself:** both behaviours react to what Supabase returns, so turning “Confirm email” on and adding SMTP on domain day brings back the full flows with no code change.

### B. “Still learning” linger
- [x] Left swipe: the card drifts aside with a slower spring (1.7 s vs 1.2 s for “known”), stays **sharp and readable for 2.2 s** beside the new card, then softens into the water.
- [x] **Never blocking:** the next card is focused and interactive immediately. A test swipes again straight away.
- [x] Comes back **twice**: after 3 cards, then (marked known on review) once more after 8. A left swipe on review starts over. Tested exactly: positions 3 and 11.
- [x] Reduced motion: a 0.8 s still hold in place, then a fade. It reappears in its slot without drifting.
- [x] Text-only view: the previous word lingers beside the new card, then fades. With reduced motion it holds, then fades (tested).

### C. Pearl of the Day selection
- [x] `shared/pearlOfTheDay.ts`: deterministic date → word by **Europe/Amsterdam calendar day**. Cycles show every word once before any repeats, and never the same word two days running across a cycle boundary.
- [x] **Stable as words grow:** new words carry `added: "YYYY-MM-DD"` and join the first cycle that starts after that date, so past and already-announced days never change. The validator enforces the field's format.
- [x] One module used by the site, the email sender and the tests.
- [x] Unit tests: winter and summer midnight, spring-forward and fall-back days, the 07:00 hour across DST, determinism, no repeats across 3 cycles, adding words mid-cycle and on a boundary (11 tests).
- [x] `/` opens on today's pearl with **دُرَّةُ اليَوْم · Pearl of the Day**. `/word/<slug>` deep links are unchanged.
- [x] Same in the text-only view.

### D. Card images
- [x] Rendered by **headless Chromium** (browser text shaping), compressed with sharp. Dark water, iridescent rim, Markazi headword, transliteration, first meaning, and a small Aref Ruqaa **دُرَر Durar** signature in the corner.
- [x] Two sizes: email card 600 × 340 at 2× (1200 × 680 px) and social preview 1200 × 630, plus a general **Durar** card.
- [x] `og:image` (with type, width, height, alt) and `twitter:image` (+ alt, `summary_large_image`) on every word page, `/` and `/privacy`.
- [x] **Cached:** Vercel's build machines have no browser, so the PNGs are rendered with `npm run cards` and committed under `public/cards/` (17 MB for 282 images) with a content-hash manifest. Only new or changed words are re-rendered. **Build-time impact on Vercel: under a second** (the stale-image check). A full re-render takes about 104 s locally, and only happens when the template changes.
- [x] Alt text: headword, transliteration and meaning, e.g. “بَحْر (baḥr): sea”.

### E. Subscriptions (backend)
- [x] Migration `20260925000000_pearl_of_the_day.sql`: `subscribers` (unique lower-case email, `pending`/`confirmed`/`unsubscribed` plus `bounced`/`complained`, SHA-256 confirmation-token hash, optional `user_id`, timestamps), `daily_sends`, `subscribe_attempts`. **RLS on with no policies**: anon and authenticated users are denied. Signed-in users get two safe functions, `my_subscription()` and `unsubscribe_me()`, which only see their own row.
- [x] `daily_sends` primary key (subscriber, date): nobody gets the same day twice, even across retries or overlapping runs (tested with repeated and overlapping claims).
- [x] `POST /api/subscribe`: validates the address, has a honeypot, allows 5 attempts per hour per IP (the IP is stored only as a keyed hash, for a day), gives **the same response whether or not the address exists**, sends the confirmation email, and won't resend within 10 minutes.
- [x] Confirm page `/subscribe/confirm?token=…` in Durar's look and voice (confirmed / already confirmed / expired / invalid).
- [x] Unsubscribe: the link opens `/unsubscribe?token=…`, which unsubscribes on arrival, confirms, and offers resubscribe, with no sign-in. Every email carries `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, which POST to `/api/unsubscribe`. Unsubscribe links are HMAC-signed, not stored, and a GET never changes anything, so mail scanners can't unsubscribe people.
- [x] Pending subscriptions older than 7 days are deleted by the daily housekeeping.
- [x] Account-menu toggle **Pearl of the Day email**: Google accounts skip double opt-in; email accounts get the confirmation email (“Confirm in inbox”). Supabase's own “email confirmed” flag is ignored, because it's always set while confirmation is off.
- [x] Delete account also removes the subscription (by account or email) and, by cascade, the send log (tested). The Privacy page now covers subscribers, SES in Frankfurt, no tracking, and how to unsubscribe or delete.
- [x] Secrets are server-only. The exact names are in `docs/EMAIL-SETUP.md` and below.

### F. Subscribe UI
- [x] “Get the Pearl of the Day by email” sits under the Pearl of the Day label. It opens the same dark-glass sheet as sign-in (focus trap, Escape, focus return, zero axe violations).
- [x] Also in the text-only view.
- [x] Success: **“Check your inbox to confirm”**, plus the address and how long the link works.
- [x] **Hidden on the production site until domain day.** Visible on previews and locally. It's a build-time flag from `VERCEL_ENV`; `EMAIL_SIGNUP=on` switches it on. The account-menu toggle follows the same flag (tested both ways).

### G. The email
- [x] Template: dark water gradient (with solid fallbacks), the card image, then transliteration, meaning(s) and one example as live text. The Arabic sentence has `lang="ar" dir="rtl"`. Button: **Open in Durar** → `/word/<slug>`.
- [x] Footer: why you're getting it, Unsubscribe, Privacy, contact.
- [x] Plain-text part (multipart/alternative, UTF-8, RFC 2047 subject).
- [x] Confirmation email in the same style, kept short.
- [x] Subject lines. **Pick one:** set `EMAIL_SUBJECT_STYLE`.
  - **a** (default): `دُرَّةُ اليَوْم · سَرَاب — mirage`
  - **b**: `Pearl of the Day: سَرَاب (sarāb)`
  - **c**: `سَرَاب · sarāb — your pearl for today`
- [~] **Client testing:** I checked the rendering in Chromium at desktop and phone widths and with images blocked. RTL is correct and it reads fully with images off. **Gmail (web, iOS, Android, dark mode), Apple Mail and Outlook need your inbox.** Send yourself a test (see below). A checklist is in `EMAIL-SETUP.md` §5.

### H. Sending
- [x] Email adapter (`server/email/types.ts`) with an **Amazon SES v2** implementation (eu-central-1) sending raw MIME. Switching provider means one new file.
- [x] Daily job `GET /api/cron/daily`, protected by `CRON_SECRET`. **Scheduler: Supabase `pg_cron`.** It's free, runs to the minute, and calls every 10 minutes from 05:00–06:59 UTC. The function only sends in the **07:xx Amsterdam** hour, which covers both DST offsets with no changes. Each call sends batches for up to 45 s at the SES rate (1/s in the sandbox), so a day's sending is spread over up to six calls. Vercel Hobby cron was ruled out: it runs at most once a day, at an imprecise minute. EventBridge would mean more AWS setup than this needs.
- [x] Idempotent through `daily_sends` (tested). A failed send is logged and not retried that day.
- [x] Bounces and complaints: SES's account suppression list blocks them, and each run marks addresses from that list as `bounced`/`complained` so they're never claimed again (needs the optional `ses:ListSuppressedDestinations` permission).
- [x] Dry run (`?dry=1`, or `EMAIL_MODE=dry-run`), test send to the owner (`?test=1` / `npm run email:test`, not logged), and `npm run email:render` for a local look.
- [x] **Sandbox until domain day:** `EMAIL_MODE=sandbox` only ever emails `EMAIL_SANDBOX_TO`. This is enforced both in the SQL claim and before every send. Going live means setting `EMAIL_MODE=live`.
- [x] **Keeps Supabase awake:** every morning run calls Supabase's API several times (housekeeping, claims, logging), so the project sees daily database activity from outside and won't pause for inactivity.

### I. Tests
- [x] Unit: schedule (11) and the flag (1).
- [x] Playwright (21 new): Pearl of the Day on `/`, deep links unaffected, text-only label; linger doesn't block, comes back twice, text-only linger; subscribe form (success, invalid email, honeypot, rate limit, text-only entry, axe); confirm page (success + expired); unsubscribe page (one visit + resubscribe, POST only, axe); noindex HTML; og:image tags and PNGs; flag hides the entry and the account toggle; interim sign-up and reset; account toggle for Google and email accounts.
- [x] Database (19 new): no direct access for anon or authenticated; server functions not callable by them; opt-in, expiry, unsubscribe/resubscribe, verified-address shortcut, IP rate limit, bounces; once-per-day claiming, sandbox allow-list, housekeeping; own-row-only account functions; delete-account cascade.
- [x] Email: rendering snapshots and an automated **no-tracking check** (at most one image, which must be the card; no 1×1 or hidden images or CSS background loads; every link on our own site or `mailto:`; no campaign or tracking parameters). Server handlers are also tested end to end against PostgreSQL (11).
- [x] All existing tests pass. Five Phase 0.1 assertions were updated for an intended change: `/` now opens on today's pearl instead of دُرَّة, and word pages use `summary_large_image`.

**Totals: 63 Playwright · 32 database · 32 unit/server, all passing.** CI runs all of them, plus a check that the functions load as plain Node ESM, the way Vercel runs them.

## Quality bar

- **Accessibility:** zero axe violations on the subscribe sheet and the email pages, and Lighthouse Accessibility 100. The account toggle is a `menuitemcheckbox` with `aria-checked` (`mixed` while waiting for confirmation). The emails use `lang`/`dir`, real alt text and light-on-dark contrast.
- **SEO:** word pages stay at 100 and now carry preview images. Email pages are `noindex`.
- **Performance:** first-paint JS **+2.0 KB gzip** (94.6 → 96.6 KB), CSS +0.6 KB. The subscribe sheet (1.8 KB), email pages (1.5 KB) and email client (0.9 KB) are lazy chunks.
- **RTL:** labels, sheet, email pages and emails.
- **Motion:** the linger has a reduced-motion variant in both views.

### Lighthouse (production build served locally; headless Chromium, software WebGL)

| Page | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| `/word/bahr` desktop | 68 | 100 | 100 | 100 |
| `/word/bahr` mobile | 50 | 100 | 100 | 100 |
| `/unsubscribe` desktop | 100 | 100 | 100 | 63 (noindex by design) |

Word-page performance is the same as in 0.1 and 0.2. The live-URL run is still to do.

## Server environment variables (never `VITE_`)

`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, `SES_REGION`,
`EMAIL_FROM`, `EMAIL_MODE`, `EMAIL_SANDBOX_TO`, `EMAIL_TOKEN_SECRET`, `CRON_SECRET`, and optionally
`EMAIL_SUBJECT_STYLE`, `EMAIL_SEND_HOUR`, `SES_RATE_PER_SECOND`. On domain day: `EMAIL_SIGNUP=on`.
What each one is and where to get it: `docs/EMAIL-SETUP.md` §2.

## Needs your input

1. **`main` branch:** create it from `claude/new-session-id31u5` (GitHub → Branches → New branch), or allow this session to push it and I'll do it. Then switch Vercel's production branch (your guide, Part 5).
2. **Let me reach the live site:** add `arabic-lang-project.vercel.app` to this environment's allowed network domains, so I can verify the live flows and SEO tags and run Lighthouse there.
3. **Amazon SES:** your guide's Part 4, plus the variables above (optionally add `ses:ListSuppressedDestinations` to the policy).
4. **Supabase:** run the new migration, enable `pg_cron` and `pg_net`, and run `supabase/setup/daily-email-cron.sql` with your `CRON_SECRET` (`EMAIL-SETUP.md` §3–4).
5. **Subject line:** a, b or c (above).
6. **Send time:** 07:00–08:00 Amsterdam by default. Change it with `EMAIL_SEND_HOUR`, and move the hours in the pg_cron schedule to match.
7. **Test in your inbox:** once SES is set up, send a test (`EMAIL-SETUP.md` §5) and check Gmail (web, iOS, Android, dark mode), Apple Mail and Outlook.

## Still open

- Native-speaker review of the 140 words, and a real-device performance check.
- Domain day (backlog): its steps are at the end of `EMAIL-SETUP.md`.
