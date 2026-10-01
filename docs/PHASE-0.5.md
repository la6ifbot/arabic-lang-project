# Phase 0.5 — Email go-live + Mastery: report

Live: https://durar.space, **deployed from `main`** since 2026-09-26 12:18 UTC (you switched Vercel's
production branch; deployment of `30baa7c`, READY). Both tracks are merged to `main` (PR #2, PR #3 and PR #12), and both are done.
You ran the three database files on 2026-09-26 at about 15:19 UTC. Checked live: `word_progress` now
exists, and visitors who aren't signed in are refused, as intended.

Legend: **[x]** done and verified · **[~]** built, waiting on the owner or on something I can't reach from here ·
**[ ]** not done

## Track A: Email go-live & operations

Built in PR #2 and finished in PR #12 (both merged). **Track A is done:** you confirmed in the project
chat on 2026-10-01 that every step is complete and the site works. Summary from the Email go-live thread:

- [x] **A1. Owner subscribed.** You subscribed and confirmed on 26 Sep. `EMAIL_SIGNUP` was off during the
  sandbox period and has been on since 28 Sep 17:08 UTC.
- [x] **A2. Scheduled runs.** The 07:00 Amsterdam run delivered every day from 27 Sep to 1 Oct: each email
  came from `pearl@durar.space` and reached the Inbox at 05:00 UTC. No alarm was sent.
- [x] **A3. SES domain.** `durar.space` is verified in Frankfurt (eu-central-1) with Easy DKIM since
  26 Sep 18:31 UTC. DMARC is `p=none`, with reports to `hello@durar.space`. The custom MAIL FROM was
  skipped on purpose and can be added later.
- [x] **A4. Sender switch.** `EMAIL_FROM` is `Durar <pearl@durar.space>` and `EMAIL_REPLY_TO` is
  `hello@durar.space`, since 26 Sep 19:23 UTC. In Gmail, SPF, DKIM (`d=durar.space`) and DMARC all pass,
  the email lands in the Inbox, and one-click Unsubscribe shows.
- [x] **A5. SES production access.** Amazon approved it in Frankfurt on 28 Sep 13:12 UTC (50,000 a day,
  14 a second). `SES_RATE_PER_SECOND` stays at 1, as Amazon was told.
- [x] **A6. Auth emails through SES.** Supabase sends through SES SMTP (port 587, sender
  `pearl@durar.space`), with both Durar templates pasted and **Confirm email** on. Since PR #12 the links
  go to `durar.space/?durar=verify|reset&token_hash=…` and the site verifies them itself, so they work in
  any browser or device. You re-pasted both templates and tested sign-up, reset and subscribe with a
  second address.
- [x] **A7. Live.** `EMAIL_MODE=live` since 28 Sep 17:08 UTC, and production was redeployed. The subscribe
  button is back on durar.space, and the scheduler's dry run returned `"mode":"live"`.
- [x] **A8. Monitoring.** Unchanged: the 08:15 health check emails an alarm to `EMAIL_SANDBOX_TO`, because
  `ALERT_EMAIL` is not set. No alarms so far.
  - Migration `supabase/migrations/20260925120000_email_monitoring.sql`: a `daily_runs` table, `daily_run_record()`, `daily_health()` and a 60-day cleanup.
  - `/api/cron/health` (needs `CRON_SECRET`) emails the owner when today's run is missing, errored, left people waiting, or had failed sends.
- [x] **A9. `CRON_SECRET` rotated** on 28 Sep. The vault and Vercel values match (the scheduler's check
  returned 200). That the old secret now gets a 401 was not tested separately.
- [x] **A10. Live checks** (the Email go-live thread, 2026-09-26 on `30baa7c`, read-only). All of these passed:
  - **Redirects:** `www.durar.space`, `arabic-lang-project.vercel.app` and `http://durar.space` all redirect with a **308** (one hop) to `https://durar.space/…`.
  - **Canonicals:** `/word/bahr` has its canonical, `og:url` and JSON-LD on durar.space, and `og:image` is a 1200×630 PNG.
  - **Sitemap:** 142 URLs, all on durar.space and all returning 200 with a self-canonical, and `robots.txt` points to it.
  - **Privacy contact:** the Privacy page shows `hello@durar.space`.
  - **Desktop Share menu:** WhatsApp, Copy link and Download image all work, and Escape returns focus.
  - **axe:** zero violations on `/`, `/word/bahr`, `/privacy` and `/library`.
  - **Also checked:** security headers, no horizontal scroll on a Pixel 7, and the Share target at 44×44.
- [x] **A10, the flows that need a real account or inbox.** You did these yourself. On 28 Sep, made-up
  email links reached Supabase's real verify step and got the right "expired or already used" message.
- **Two notes from those checks:**
  - `www.durar.space/api/…` redirects too. That's Vercel's domain-level redirect, and the scheduler uses the apex, so it doesn't matter. The doc wording is fixed in PR #6.
  - Unknown paths get Vercel's bare text 404 rather than a Durar page. The status is right for SEO; a styled 404 page is a small later choice.
- [x] **A11. [`OPERATIONS.md`](OPERATIONS.md):** every environment variable (names only, and where each
  is set), the cron schedule, checking a run, rotating secrets, switching between sandbox and live, the
  “morning email didn't arrive” runbook, and email authentication. Since PR #12 it describes email as
  live (as of 28 Sep), matches the current Vercel, Supabase and AWS screens, and covers the scheduler
  check (§4) and the weekly SES reputation check promised to Amazon.

## Track B: Mastery

Built in PR #3 (merged).

### B1. Data
- [x] **Migration** `supabase/migrations/20260926000000_word_progress.sql` (run by you on 2026-09-26):
  - The `word_progress` table has the columns asked for, primary key (`user_id`, `word_slug`), the slug-format check, `box` limited to 1–5, and an index on (`user_id`, `due_at`).
  - A cap of 5000 rows per user, enforced by a trigger. A user at the cap can still update words they already have.
- [x] **RLS:** each user can read and write only their own rows. Anon gets no grants. Rows delete on cascade with `auth.users`.
- [x] **Saving:** `save_progress(rows)` upserts a batch of up to 500 rows. The latest `last_reviewed_at` wins, and a clock more than 5 minutes ahead is clamped, so a device with a wrong clock can't pin a word.
- [x] **`reset_my_progress()`** deletes only the caller's progress and returns how many rows it deleted. Saved pearls are never touched (tested).
- [x] **`revisit_candidates()`**, for the email, is service-role only.
- [x] **Retired slugs are skipped quietly:** in the queue, the Library, the depth share and the email.
- [x] **“Due” means `due_at <= now`**, compared to the millisecond, with no calendar-day logic.

### B2. Schedule
- [x] **One module,** `shared/mastery.ts`, used by the site, the email sender and the tests. It has the box rules, the intervals (1, 3, 7, 16 and 35 days), the due ordering and the merge rule.
- [x] **Box rules:**
  - The first swipe: right goes to box 2, left to box 1.
  - After that, right moves up one box (box 5 is the ceiling), and left goes back to box 1 with `lapses + 1`.
  - `due_at` is recalculated every time.
- [x] **In-session returns never move a box.** A word's box moves at most once per visit.

### B3. Saving progress
- [x] **Signed in:** saves are optimistic, batched every 0.7 s and sent with `keepalive` (on leaving the page too). When offline they retry quietly, from 2 s up to 60 s. Rows waiting to be sent survive a reload, and they belong only to the account that made them.
- [x] **Signed out:** kept in `localStorage` (capped at 2000 words). Every read and write is wrapped in try/catch, and a Playwright test runs the whole flow with storage blocked.
- [x] **Merge on sign-in:** the latest review of each word wins, and the newer rows are uploaded. Then the browser copy is cleared. Tested after email sign-in, Google sign-in and the email-link redirect.
- [x] **Progress never delays first paint.** It loads in idle time after the scene is ready, and swipes made before then are kept and applied.

### B4. The sea's queue
- [x] **Pearl of the Day stays first** on `/`. Deep links are unchanged.
- [x] **One due word for every two new ones.** Due words come most overdue first, then lowest box. New words come in a stable shuffled order per user (per browser for guests). The pattern holds across rebuilds, and a Playwright test checks the order new, new, due, new, new, due…
- [x] **Known words that aren't due** move to the back of the order and drift behind the focused card at their depth: up to 5 of them, or 3 on low-power devices. You can click them to open them.
- [x] **“You’ve met every pearl for now. The sea will bring some back soon.”** shows when nothing is new or due. It's announced politely, and free browsing continues.
- [x] **Search** finds any word, whatever its box (tested in the met-all state).

### B5. Depth visuals
- [x] **Background cards sit at their box's depth:** box 1 near the light, unseen words mid-water, and box 5 deepest.
- [x] **A right swipe sinks the card** toward its new box's depth. A left swipe keeps the linger.
- [x] **The whole sea deepens** with the share of known words, up to a cap of 30% darker. Only the water shader darkens.
  - A Playwright test compares 0% and 100% known: the focused card's WCAG contrast ratio is the same within 1%, and the water behind it is more than 10% darker.
- [x] **The deepening is too slow to notice mid-session:** it eases over about 40 s from where the last visit ended. With reduced motion it's applied instantly, with no animation.
- [x] **Announcements:** “Marked known · returns in 3 days” / “Still learning · back tomorrow” through a polite live region, with a faint caption the same (hidden from screen readers, so it isn't read twice).
- [x] **Text-only view:** the same announcements, and a “Still learning” / “In the deep · 3 of 5” label on the card.

### B6. Library (`/library`)
- [x] **Saved pearls plus every swiped word,** with filters **All · Saved · Still learning · In the deep** and the sort you already had.
- [x] **Count line:** “12 in the deep · 5 still learning · 8 saved”.
- [x] **Each card shows its depth** as five small pearls with the text label beside them, and “returns in N days” or “due now”. Saved words also show a “Saved” tag.
- [x] **Clicking a card** opens the sea focused on that word.
- [x] **Empty states** for each filter, in Durar's voice.
- [x] **Signed out,** a banner says progress is kept in this browser only.

### B7. Reset, delete, privacy
- [x] **Reset my progress…** is in the account menu and at the foot of the Library. The confirmation has “Keep my progress” focused by default. Resetting clears the database and browser copies, and saved pearls stay (tested, signed in and as a guest).
- [x] **Deleting an account deletes its progress,** through the cascade (database test) and in the flow (Playwright test). The dialog text says so.
- [x] **Privacy page** now covers:
  - what progress is stored;
  - that signed-out progress stays in the browser only;
  - how to reset it;
  - that the email's revisit line uses it;
  - that it's used for nothing else.

### B8. Email: “A pearl to revisit”
- [x] **Who gets the line:** subscribers linked to an account who have a due word get one line under the main card: **“A pearl to revisit: سَرَاب (sarāb) — mirage”**, linking to `/word/<slug>`.
  - The word is the most overdue, lowest box, skipping retired words and today's pearl.
  - The Arabic is live text with `lang="ar" dir="rtl"`.
  - The same line is in the plain-text part.
- [x] **Everyone else gets exactly the same email,** byte for byte (the existing snapshots didn't change). If the progress lookup fails, the email goes out without the line.
- [x] **Snapshots** with and without the line. The no-tracking check passes on both.

### B9. Tests
- [x] **Unit (26 new):** schedule transitions, the ceiling, the first-swipe rules, the due ordering, the interleave and queue order, in-session returns, the merge rule, validation, depth mapping and the depth cap.
- [x] **Database (16 new):** RLS, anon denied, the checks, the merge rule and clock clamp, the batch limit, the row cap, `reset_my_progress()` keeping saved pearls, `revisit_candidates()`, and the delete cascade.
- [x] **Playwright (18 new), with a controllable clock:**
  - persistence after a reload, as a guest, signed in and with storage blocked;
  - retry after going offline;
  - the merge on email, Google and email-link sign-in;
  - due words coming back on a later day;
  - the interleave and the met-all state with search;
  - Pearl of the Day staying first;
  - the depth contrast test;
  - reduced motion and text-only parity;
  - Library filters, counts, labels and empty states;
  - reset from the menu and as a guest (saved pearls kept), and the delete cascade;
  - axe clean on the Library and the reset dialog.
- [x] **Email:** snapshots and the no-tracking check.
- [x] **All existing tests still pass.** The share test “story images” (four page loads and four image renders) now has 5 minutes instead of 2. It takes about 45 s on its own, the same on `main`, but it ran out of time on busy CI runs. It had also failed once on `main`.

**Totals on `main` (both tracks): 97 Playwright · 48 database · 73 unit/server, all passing.**

## Quality bar

- **Accessibility:** zero axe violations, including on the Library, the reset dialog and the text-only view. Lighthouse Accessibility 100. Progress is never shown only visually: the announcements, depth labels and Library text carry it too.
- **SEO:** word pages stay at 100. The Library stays `noindex`.
- **Performance:**
  - Progress code is lazy: the engine is 1.9 KB gzip, the Library 2.6 KB and the reset dialog 0.7 KB.
  - First-paint JS grew by **0.69 KB gzip** (97.21 → 97.90 KB) and CSS by 0.45 KB (9.10 → 9.55 KB).
  - Drifting known cards are capped at 5, or 3 on low-power devices.
- **RTL:** every new Arabic string is marked `lang="ar" dir="rtl"`, including in the email.
- **Privacy:** no tracking. Progress is used only for the queue, depth, the Library and the email's revisit line.
- **Motion:** reduced motion applies the sea's deepening instantly. The card sinking follows the site's existing reduced-motion rule.

### Lighthouse (production build served locally; headless Chromium, software WebGL)

Measured side by side with `main` before Track B, `/word/bahr`, two runs each:

| | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| Desktop, before B | 65, 65 | 100 | 100 | 100 |
| Desktop, after B | 66, 65 | 100 | 100 | 100 |
| Mobile, before B | 46, 46 | 100 | 100 | 100 |
| Mobile, after B | 44, 43 | 100 | 100 | 100 |

Performance under software WebGL is dominated by the 3D scene's main-thread time, and it varies by a few
points between runs.

### Lighthouse live on durar.space (`/word/bahr`, 2026-09-26, 3 runs each, median)

| | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| Desktop | 67 (runs 94, 66, 67) | 100 | 100 (96 in two runs) | 100 |
| Mobile | 65 (runs 37, 65, 67) | 100 | 100 | 100 |

- **Desktop medians:** LCP 0.46 s, TBT 0.98 s, CLS 0.
- **Mobile medians:** LCP 1.96 s, TBT 2.41 s, CLS 0.
- **Best practices 96:** two desktop runs saw two font requests fail with a 502 through the sandbox proxy. None of 22 later fetches failed.
- **Treat Performance as a lower bound.** These runs used software WebGL with no GPU, and every request went through the sandbox proxy. Most of the cost is running the 3D scene's JS. Vercel Speed Insights or CrUX would give real-visitor numbers.

## Live check (durar.space, 2026-09-26, as a signed-out visitor)

The page was driven in headless Chromium; its requests were fetched with certificate checks by Node,
because this sandbox's Chromium can't validate certificates through its network proxy.

- [x] `/word/bahr` opens with **بَحْر** focused. A right swipe is announced “Marked known · returns in 3 days” and stored in the browser as box 2.
- [x] After a reload the word is still in box 2.
- [x] `/library` shows “1 in the deep · 0 still learning · 0 saved” and the “kept in this browser only” banner.
- [x] **Reset my progress…** clears the browser copy, and the Library shows its empty state.
- [x] The Privacy page covers progress and the revisit line.
- [x] No script errors on any of these pages.
- [~] Signed-in progress and the merge on sign-in need a real account. The table is now in place (see “After the migrations”).

## Needs your input (owner actions)

Nothing is left for Phase 0.5. Two open items belong elsewhere:

- **Google sign-in** fails with "Unsupported provider: provider is not enabled". It has its own thread,
  "Google sign-in".
- **Optional later:** a custom MAIL FROM (A3), and setting `ALERT_EMAIL` if alarms should go somewhere
  other than `EMAIL_SANDBOX_TO` (A8).

## After the migrations (you, two minutes)

Signed in on durar.space, swipe two words, then open My Pearls on another device or browser. The two
words should be there with their depth. Then, signed out in a private window, swipe one word, sign in,
and check it appears in My Pearls too.

## Follow-up: Arabic font (2026-09-26)

Words with a shadda (رَحَّالَة, مَشْرَبِيَّة, خَطّ and 8 more of the 140) showed a squashed, misplaced
mark: Markazi Text draws shadda + fatha badly. The data was fine. At the owner's choice the site now
uses **Noto Naskh Arabic** everywhere Markazi was: the 3D cards, the text-only view, the story image,
the static card images (all 141 re-rendered) and the emails. Headwords got a little more line height
so tall stacks like the damma over ط in طُمَأْنِينَة don't touch the transliteration. Fonts are not
JavaScript, so first-paint JS is unchanged; the two Arabic weights are 52 KB and 57 KB (woff2),
self-hosted like before.
