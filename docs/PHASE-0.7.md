# Phase 0.7 — Backend foundations + The Deep: report

Live: https://durar.space, deployed from `main` at `f7df326` (PR #60, merged 14 Oct 17:38 UTC, after The
Deep, #61). The site now runs its functions in **Frankfurt**, behind **Cloudflare Turnstile** and an **enforced
Content-Security-Policy**. Production is backed up every night, encrypted. Database changes go through
GitHub, staging first, and production only after Lativ approves. An external monitor and a weekly
digest watch it all. The anatomy of a word is live on every card, and **The Deep** is live at
`/deep`.

The phase ran from 5 to 13 October in six threads: security and region (A–B), data safety (C),
monitoring and GDPR (D–E), The Deep (F), the anatomy of a word (G) and 500 words (H). Claude's side is
finished. Lativ kept every step for the end (13 Oct) and merged The Deep (#61, with its production
database run approved) and the restore fix (#60) on 14 Oct. What still waits on Lativ:

- **The 200 new words** are ready in eight batch PRs (#46–#53, checks green), for Lativ's review. Until
  then the sea holds 300 words.

Lativ's one ordered list, click by click, is `phase-0.7/durar-phase-0.7-your-steps.md` in the project
files; a summary is at the end of this report.

Legend: **[x]** done and verified · **[~]** built, waiting on the owner or on something I can't reach
from here · **[ ]** not done

## A. Security (PRs #40 and #45)

- [x] **Leaked-key scan of the whole history** (5 Oct): gitleaks 8.21.2 and trufflehog 3.88.0 over
  every branch (151 commits), plus pattern searches for AWS, Supabase/JWT, GitHub and Google keys,
  private keys and database URLs. **Nothing real:** only CI's local `postgres:postgres` test database
  and the `.env.example` placeholder. Nothing to rotate.
- [x] **GitHub's security features.** `.github/dependabot.yml` (merged in #40): npm and GitHub Actions,
  weekly on Monday 06:00 Amsterdam, grouped (minor and patch together, majors apart). Lativ turned on
  Dependabot alerts and security updates, secret scanning with push protection and CodeQL default
  setup (13 Oct; CodeQL runs on `main`). The first round: #42 and #43 merged, #44 (TypeScript 7,
  Vite 8, Vitest 5) closed because the site doesn't build with them yet, and the security fixes #55,
  #58 and #59 merged. Dependabot's pull requests get none of the repository's secrets, so #45 makes
  them skip the image upload job, which had failed on every one.
- [x] **Turnstile** on subscribe, sign-up, sign-in, password reset and "resend the link". Sign-in is
  included because Supabase's CAPTCHA setting covers every password request. Managed mode, shown only
  when Cloudflare is unsure (`interaction-only`), with a fresh single-use token for each request. The
  text-only view uses the same forms. `/api/subscribe` checks the token with Cloudflare before it
  touches the database and answers `403 captcha_failed` otherwise. A signed-in person subscribing
  their own address needs no token. The error is friendly and announced: "We couldn't finish the quick
  check that keeps bots out…". CI and previews use Cloudflare's test keys. Google sign-in is unchanged.
  Lativ made the widget and added the keys on 11 Oct, then tested sign-in and reset before and after
  switching on Supabase's side. Checked live: the site carries the real site key, and a request
  without a token, or with a forged one, is refused.
- [x] **Security headers.** A Content-Security-Policy allowing only the site itself,
  `img.durar.space`, Supabase and Turnstile, plus `frame-ancestors 'none'`, HSTS with
  `includeSubDomains`, and `Cross-Origin-Opener-Policy: same-origin`, on top of the existing ones. It
  went live report-only with #40 (11 Oct), then enforced with #45 (12 Oct). The browser suite runs
  under it (`vite preview` sends `vercel.json`'s headers), `tests/csp.spec.ts` checks every page type
  for violations, and the real-Turnstile test fails on any. Before and after enforcing, a scan of
  durar.space in Chromium (every page type, both dialogs, Share's download, the anatomy layer, the
  text view, the 404 search) found **zero violations**. The 404 page's inline script moved to a file
  for this.
- [x] [`OPERATIONS.md`](OPERATIONS.md) §8: Turnstile, the switch-on order, the emergency off switch,
  the headers, and how to add an allowed host to the CSP.

## B. Region (PR #40)

- [x] **Functions run in Frankfurt** (`"regions": ["fra1"]`). Live since 11 Oct 16:09 UTC:
  `x-vercel-id` shows `…::fra1`.
- [x] **Latency, before and after.** Both measured from a machine near Vercel's Washington edge
  (`iad1`), median server time:

  | Call | Before (5 Oct, n=15) | After (11 Oct, n=40) |
  | --- | --- | --- |
  | `/api/confirm` (one database call) | 366 ms | 353 ms |
  | `/api/subscribe`, invalid email (no database) | 196 ms | 264 ms |
  | `/api/unsubscribe` | 178 ms | 267 ms |
  | Static page | 164 ms | 149 ms |
  | Supabase directly | 177 ms | 179 ms |

  The database step inside a function fell from about 170 ms to about 90 ms. From a US vantage the
  no-database calls got about 70 ms slower, because Washington's edge now crosses the Atlantic to reach
  the function. For a visitor in Europe both crossings are gone: an estimated 150 ms saved on a call
  with one database step, and about 70 ms without. That's an estimate; nothing was measured from Europe.
- [x] **Everything still works.** The cron routes refuse a wrong secret from `fra1`. Subscribe,
  confirm and unsubscribe answer as before, and `/api/health` (D) answers `{"ok":true}`. Every daily
  email since the move completed: 12 Oct and 13 Oct each sent 5 with 0 failures, as before. Each
  email used to cross the Atlantic twice, which capped the pace at about 3 a second. Now
  `SES_RATE_PER_SECOND` sets the pace, but with 5 subscribers the gain can't be seen yet.

## C. Data safety (PRs #39 and #60)

- [x] **Nightly encrypted backups** (01:17 UTC). `supabase db dump`, sign-in accounts included, is
  encrypted with age before it leaves the runner. It goes to a private, versioned bucket in Frankfurt
  (30 dailies, 12 monthlies), and S3 checks every upload against our SHA-256. Each backup opens with
  either of two keys: Lativ's, kept offline in two places, or the restore-test key, a GitHub secret.
  The upload user can only add files. Nothing from the dump appears in logs or artifacts. A failure
  opens a GitHub issue, which emails Lativ, and shows in the weekly digest. The first production backup
  ran on 13 Oct (41 tables).
- [x] **Monthly restore test.** It loads the newest daily into a throwaway database on the runner,
  compares every table's row count, and throws it away. It never touches staging. The first run (13
  Oct) **showed green without having restored**. #60 fixed it (merged 14 Oct). The real test then
  restored the 14 Oct nightly backup, and all 41 tables matched (run 38608440648).
- [x] **Restore runbook** ([`OPERATIONS.md`](OPERATIONS.md) §11): decrypt, restore all or one table,
  and how long it takes (under a minute at today's size, plus about half an hour for a new project).
  Practised on staging with the restore drill: all 41 tables match, and one table was restored back
  into staging (run 38468679915, on #60's code).
- [x] **Staging**: a second free Supabase project in Frankfurt with fake data only (seeded users and
  progress, six Deep divers). Vercel's Preview environment points at it, email there stays sandboxed,
  and it runs no production cron. Its CAPTCHA uses Cloudflare's test secret.
- [x] **Migrations through GitHub** ([`OPERATIONS.md`](OPERATIONS.md) §13). A pull request applies
  them to staging. A merge to `main` takes a fresh backup, then applies them to production behind the
  `production` environment, with Lativ as the required approver. The migrations applied by hand earlier
  were checked against production and recorded as applied in the first production run (13 Oct, six
  migrations). From now on every database change goes this way; The Deep (#61) is the first.

## D. Monitoring (PR #38, merged 13 Oct 16:51 UTC)

- [x] **`/api/health`**: checks the database and that the email settings are present. It answers
  200 or 503 with no details and sends nothing. Live.
- [x] **UptimeRobot** (free) checks the home page, a word page, `/api/health` and an image on
  `img.durar.space` every 5 minutes and emails `hello@durar.space`. Lativ set up all four monitors on
  13 Oct, and they're up.
- [x] **Error log**: API failures go to `public.error_log`, scrubbed of emails, ids, IP addresses and
  tokens, readable only by the service role, and kept 30 days.
- [x] **Weekly digest**, Mondays 08:00 Amsterdam: subscribers, emails sent and failed, bounces and
  complaints, accounts, reviews, Deep divers, the last backup and restore test, and errors. Aggregate
  counts only, styled, with a plain-text part. A line that needs a look is marked, and the subject says
  so. Lativ scheduled it on 13 Oct and received the first one.

## E. GDPR completeness (PR #38)

- [x] **Download my data** in the account menu and on the Privacy page: account, saved pearls,
  progress, subscription and the Deep entry, as JSON, and only your own. Same in the text-only view.
- [x] **Retention**, documented in [`OPERATIONS.md`](OPERATIONS.md) §9: the send log after 60 days
  (stricter than the 90 the checklist allows), the error log after 30, unconfirmed sign-ups after 7,
  hashed IPs after 1, and cron history after 30.
- [x] **Privacy page: every service that handles data**: Vercel (Frankfurt), Supabase, AWS (SES, S3,
  CloudFront), Cloudflare Turnstile, Namecheap, Google (only for Google sign-in), GitHub (the encrypted
  backups) and UptimeRobot, each with what, where and why. #61 adds The Deep's section.
- [x] **Delete my account also removes the Deep entry**, tested in #61.

## F. The Deep (PR #61, merged 14 Oct 17:38 UTC)

The production database run (fresh backup, then the migration) passed on 14 Oct after Lativ's
approval (run 38608340967), and `/deep` answers on durar.space.

- [x] **`record_review(slug, direction)`**: every signed-in swipe goes through one database function on
  the server's clock. A word moves one box deeper only when it's due, and a left swipe resets it to box 1.
  It is rate limited (120 a minute, 3,000 a day), and signed-in users can no longer write progress
  directly. The browser keeps its instant feel: it sends swipes in batches and takes the server's answer.
- [x] **Verified progress**: progress merged from a signed-out browser starts unverified and climbs
  again from its next real review (from box 2, on the server's clock). Existing accounts start at 0 on
  the board. So a number typed into browser storage can never jump the board.
- [x] Swiping right on a word that isn't due says "Already in the deep · returns in 6 days" (also to
  screen readers), and the box stays.
- [x] **Joining** from the account menu, My Pearls or `/deep`. Choose a name or take a generated one
  ("Diver 142" / «غوّاص ١٤٢»), with a note on what's public. Rename once a day, and leave at any time.
- [x] **Names**: 3–20 characters, Latin or Arabic letters, digits, single spaces and `-_.`, with no
  emoji or direction controls. Unique ignoring case, Arabic marks and digit style. Reserved names and
  an English and Arabic word list are blocked. Shown with `<bdi dir="auto">`.
- [x] **Boards**: *This week* (from Monday 00:00 Amsterdam) and *All time*, rebuilt every 15 minutes
  and at once on join, rename, leave, delete or a moderation call. Ties go to whoever got there first.
  The public tables hold only rank, name and score, and your own rank comes from a function. `/deep`
  shows the top 10, your row and "#23 of 140 divers". It's `noindex`, works in the text-only view, and
  has empty states in Durar's voice. No notifications, emails or badges about rank.
- [x] **Moderation runbook**, [`OPERATIONS.md`](OPERATIONS.md) §14: `select public.deep_hide('Name');`.
- [x] Thread 2's hooks are filled in: the digest's diver count, The Deep in Download my data, and
  account deletion.

## G. The anatomy of a word (PR #41, merged 11 Oct 16:06 UTC)

- [x] **Letter table** `src/data/letters.json`: 36 rows (28 letters, the hamza forms, ة and ى), each
  with its Arabic and transliterated name, a sound hint, four shapes and whether it joins forward. It's
  in Lativ's review.
- [x] **Segmentation, counting and syllables** (`shared/anatomy.ts`) follow decisions 18–19: لا counts
  as two, shadda counts once and is marked "doubled", vowel marks stay with their letter. An optional
  `syllables` field overrides tricky splits ([`CONTENT.md`](CONTENT.md)). `npm run validate:data` runs
  every headword through it: an unknown character fails, and a guessed split warns. Today that's 13 of
  300 words, all with al-, and 21 of 500 once the batches merge.
- [x] **The unthread**: tap the headword, use the small necklace button beside Share, or press `L`. The
  letters slide apart right to left on a thread that breaks after non-joining letters, ease from their
  in-word shape to their standalone shape, and show the count. Reduced motion fades instead. Tapping a
  letter shows its name, sound and four shapes, with the arrow keys moving between letters and Escape
  closing. A **Syllables** step groups the beads with the sound under each. Screen readers get the
  whole description, and the text-only view has it too. First-visit help mentions it in one line.
- [x] Lazy-loaded: first paint grew by 0.44 KB gzip of JavaScript (and 0.08 KB of CSS), and the layer
  itself is a 6.4 KB chunk. A clean hook is left for pronunciation audio (`src/lib/pronounce.ts`).

## H. Content: 500 words

- [x] **Plan** (#37, merged 12 Oct): 200 candidates across the seven topics (76–80 per topic once all
  merge) with near-duplicates checked, approved by Lativ on 11 Oct. The Sheet import now keeps words
  that are in the repository but not in the Sheet yet.
- [~] **Eight batches of 25** (#46–#53), each on its own branch from `main` (never stacked), with
  its preview link and the "uncertain items" list at the top, and a second self-check pass before
  opening. All green. **Waiting on Lativ's review** (Lativ chose, 12 Oct, to review after the phase).
  The Sheet rows for each batch are ready to append once it merges.
- [x] **Scale check at 500** (#54, merged 12 Oct): examples and etymologies now load on demand. With
  all 500 words, first-paint JavaScript is **107.3 kB gzip** (120.9 kB before #54, and it would be
  150.2 kB at 500 words without it). CI now runs `npm run check:bundle` with a 120 kB gzip budget.
  Search and the 3D scene's card limit are unchanged. The anatomy pass covers every word.
- [x] The site never states a word count, so there was no "300" to update.

## I. Tests

- [x] Unit and browser tests came with each PR: Turnstile on every form (stub and Cloudflare's real
  script with the test key), CSP zero violations, the anatomy (segmentation, joins, counts,
  syllables, keyboard, reduced motion, text-only, axe, visual snapshots of four words), health, the
  digest, the export, retention, and duplicate and near-duplicate words. Pearl of the Day's first cycle
  (24 Sep 2026 to 10 Feb 2027) is pinned.
- [x] Database tests against PostgreSQL in CI: RLS, retention, the export returning only your own data.
  #61 adds 29 for The Deep: review rules, no direct writes, the verified merge, names, boards exposing
  only name, score and rank, the weekly reset across DST, and leave, delete and hide.
- [x] CI: the backup check with fake data and a throwaway key on any change to backups or migrations,
  staging migrations on a PR, and the bundle budget.
- [x] `main` is green.

## Quality bar

- **Accessibility:** the Turnstile error, the anatomy layer and `/deep` are axe clean in their tests.
  Lighthouse wasn't re-measured this phase.
- **SEO:** unchanged; `/deep` is `noindex`.
- **Performance:** first paint grew by 0.44 KB (anatomy) and 0.5 KB (The Deep); Turnstile
  and the board load lazily. #54 keeps 500 words under the budget. Latency before and after: section B.
- **Privacy:** no analytics or cookies. The board shows only chosen names. Every service is listed.
- **Security:** no secrets in the repository or in logs (the history scan, push protection, and backups
  that never print). The CSP is enforced.

## Your steps (one ordered list)

The click-by-click version is `phase-0.7/durar-phase-0.7-your-steps.md` in the project files:

1. Review and merge the eight word batches, #46–#53, in order.
2. From 0.6: `SES_RATE_PER_SECOND` = 5, then redeploy.
3. Append each merged batch's rows to the Sheet.
4. From 0.6: the custom MAIL FROM.
5. The native-speaker review: the 500 words, the letter table and the al- syllable splits.
6. Optional: the music track for #16, `ALERT_EMAIL`, the Outlook and iCloud test, Vercel's badge on
   the Preview Turnstile secret.

Done this phase: GitHub's security features, Turnstile, the backup bucket and keys, staging, the GitHub
environments, the monitoring SQL and digest, UptimeRobot, the word list, and merging #36–#45, #54,
#55, #58, #59, #37, #38, #39, #60 and #61, with The Deep's database run approved.

## What went wrong

- **The restore test passed without restoring.** Hosted Supabase dumps grant rights to system roles
  that the throwaway database on GitHub's runner doesn't have, so the restore stopped at once. The
  workflow piped it through `tee` without `pipefail`, so the step still showed green. Found the same
  day, from the first real backup. #60 skips grants to roles that don't exist there and runs the steps
  under `bash` so a failure fails.
- **Monitoring's SQL ran in three parts by hand, with the locks in the last one.** Between parts,
  two new `security definer` functions (`ops_report`, `weekly_digest_stats`) could be called by
  anyone. Part 3 locked them on 13 Oct. Migrations now go through the pipeline in one transaction.
- **A flaky check.** One sign-in test failed twice on #45's first CI run, didn't fail in 25+ local
  runs, and passed on the next run. CI now prints a failed test's page snapshot in the log, so the next
  failure can be read without downloading the report.
- **Dependabot's first week.** All its pull requests failed CI at first (no secrets for the image
  job), and the major-version group doesn't build. Fixed in #45; majors are closed by hand.

## Next

- Lativ's list above, then 500 words are live.
- From the backlog: email sending that scales to SES's 50,000 a day; pronunciation audio on the
  anatomy hook; the star and flower pictures (#34) and topic refinements; a mobile performance pass,
  streaks, root-family visuals, a "most shared" count and a stricter DMARC; for The Deep, a quick
  meaning check before a due word moves, and friends-only boards, if they're ever needed.
- Major upgrades (TypeScript 7, Vite 8, Vitest 5) when there's time for them.
