# Durar · Phase 0.7: Backend foundations + The Deep

## How to use this

This is the next checklist from the brainstorming chat. It starts from `durar-state-2026-10-04.md` and `docs/PHASE-0.6.md`.

How work happens in this project:

- **You build in pull requests. Lativ merges, and a merge goes live.**
- You can't reach the database or Vercel's production settings. Prepare small SQL files and click-by-click steps, and Lativ runs them. Once section C exists, migrations run through GitHub instead.

Work top to bottom within each thread and stay in scope. At the end, write `docs/PHASE-0.7.md` in the usual report format, then stop and wait. Check in before anything that changes direction, adds a paid service, or adds a recurring cost.

Suggested threads:
- **(0)** security and region (sections A–B)
- **(1)** data safety: backups, staging, CI migrations (C)
- **(2)** monitoring and GDPR (D–E)
- **(3)** The Deep, the leaderboard (F)
- **(4)** the anatomy of a word (G)
- **(5)** content: grow to 500 words (H)

Threads 0, 1, 2, 4 and 5 can run in parallel. Thread 4 is front-end only and needs no backend. **Thread 3 starts after thread 1**, so its migrations go through staging and the new pipeline.

---

## Where things stand (4 Oct)

- Live: 300 words in 7 topics, topic pages, mastery, the Library, Share, a branded 404, `/credits`, and the daily email (3 subscribers). Google sign-in shows "Durar".
- **Backend:** Supabase (Frankfurt) for the database, sign-in and pg_cron. **Vercel functions currently run in Washington.** SES (Frankfurt). S3 + CloudFront for images (free plan).
- **The repo became public on 4 Oct.**
- Lativ's open steps from 0.6 (SES rate, MAIL FROM, the word review, the music track) are still open. Don't duplicate them, but keep them in the final list.

---

## Decisions already made (don't re-litigate these)

### Foundations
1. **Backups:** a **nightly GitHub Actions job** dumps the database (including sign-in accounts, following Supabase's documented dump method). It **encrypts the dump before upload** and stores it in a **new private S3 bucket in Frankfurt**, separate from the images bucket.
   - Versioning and server-side encryption on. Keep the 30 most recent dailies and 12 monthlies.
   - The repo is public, so **nothing sensitive may appear in workflow logs**.
   - A **monthly automatic restore test** loads the latest backup into a throwaway database in CI, checks row counts and discards it. It never restores real data into staging.
2. **Leaked-key scan** of the full history. If anything real is found, **rotate it first**. Rewriting history doesn't help once a repo has been public.
3. **Turn on GitHub's free security features:** secret scanning with push protection, Dependabot alerts and security updates, weekly grouped version updates, and CodeQL default setup.
4. **Cloudflare Turnstile** (free) on subscribe, sign-up and password-reset requests. Use the least intrusive mode. Supabase Auth's built-in CAPTCHA support covers sign-up and reset. `/api/subscribe` verifies the token server-side.
5. **Stricter security headers**, including a **Content-Security-Policy**. Run it in report-only mode on previews first, then enforce it once there are zero violations.
6. **Vercel functions move to Frankfurt (`fra1`).**
7. **A staging Supabase project** (free, Frankfurt) for preview deployments. It holds fake data only. Email there stays sandboxed to Lativ.
8. **Database migrations run through GitHub:**
   - on a PR → applied to staging
   - on merge → applied to production, **after a fresh backup**, behind a GitHub "production" environment with **Lativ as required approver**
9. **Monitoring:**
   - a **free external uptime monitor**, external on purpose so it still alerts if our own stack is down
   - a **weekly digest email to Lativ** (Mondays 08:00 Amsterdam) with aggregate numbers only
   - no visitor analytics, no cookies
10. **GDPR-minded completeness:**
    - **Download my data** (JSON)
    - automatic deletion of old logs
    - a **list of every service that handles data** on the Privacy page
11. **Not now:** scaling email to SES's full 50,000 a day (backlog).

### The Deep (leaderboard)
12. **Opt-in only.** People appear under a **name they choose** (3–20 characters, Arabic or Latin, filtered for offensive words in both languages, reserved names blocked, unique) or a **generated one** like "Diver 142" / «غوّاص ١٤٢».
    - Never an email, photo or initial.
    - **Leave anytime**, and the name disappears at once. Deleting the account removes it.
13. **Score = depth earned on the server.**
    - Each word counts its box (1–5). "Pearls in the deep" = words in box 2+.
    - **A word only moves deeper when it's due and swiped right on that later visit.** Swiping right on a word that isn't due (via search or a link) doesn't move it. A left swipe resets as today.
    - It's still the honest system (no quiz), but **time-gated**: reaching box 5 takes at least about four weeks of returning, so it can't be faked in a minute.
    - This rule applies to everyone's progress, not just the leaderboard.
14. **Rules run on the server.** Swipes go through one database function that computes the new box. **The browser can no longer write box values directly.** Progress merged from a signed-out browser keeps working for the person, but only counts on the board **after its next real review**.
15. **Two boards:**
    - **This week** (depth gained since Monday 00:00 Amsterdam, resets weekly)
    - **All time** (total depth)

    Each shows the top 10 plus your own row ("You're #23 of 140 divers"). The board is readable by everyone, so it encourages sign-ups, but it's `noindex`. **No notifications about rank.** Calm, in Durar's style.

### The anatomy of a word
16. **For people who can't read Arabic: the word unthreads like a string of pearls.**
    - Tapping the headword on the focused card (plus a small visible button and a keyboard shortcut) makes the letters slide apart **right to left** on a thin thread.
    - The thread stays between letters that join, and **breaks after letters that never join forward** (ا أ إ آ د ذ ر ز و ؤ, and ء, which joins nothing).
    - A count shows: "3 letters". Example: دُرَر is د ر ر, three letters that never touch.
    - Tap again and the word threads itself back together.
17. **Each letter first keeps the exact shape it has inside the word, then eases into its standalone shape.** Use zero-width joiners to draw positional forms. Vowel marks stay with their letter.
    - **Tapping a letter** shows its name (e.g. «دَال» dāl), an approximate sound for English speakers, and its four shapes (alone, start, middle, end).
18. **A second step, "Syllables",** groups the letters into beads with the sound under each: du · rar, sa · rāb.
    - Syllables are worked out **automatically** from the vowelled headword.
    - An optional `syllables` field in the word data overrides tricky cases (shadda, al-, hamzat al-waṣl, long vowels, tanwīn).
    - The validator flags words where the automatic result is uncertain, and they go into the native-speaker review.
19. **It's a crisp layer over the 3D card**, anchored like save and share, not drawn into the scene. The card dims behind it. No audio yet; leave a clean hook for pronunciation audio later.
    - **Counting rules:** written letters. لا counts as two (lām + alif). A doubled letter (shadda) counts once, marked "doubled". ة and ى count as letters.

### Content
20. **Grow the sea from 300 to 500 words** (+200), bringing each of the 7 topics to roughly 70.
    - Use the existing Sheet → PR pipeline, in **batches of about 25** (about 8 PRs).
    - Same rules as `docs/CONTENT.md`: original writing, a recorded source for every etymology and star-name claim, `added` dates so Pearl of the Day stays stable, no near-duplicates of existing words (variants, plurals, the same root with the same meaning).
    - Choose words that are **beautiful and genuinely useful**. Mix striking words with common words a learner will actually meet.
    - New words are `draft`, like the rest. Before opening each batch, do a **second self-check pass** on diacritics, examples and etymologies, and list anything uncertain in the PR, so Lativ's review starts with the doubtful ones.
    - **Don't add new topics.** Topic names stay as they are until the refinements phase.

---

## Checklist

### A. Security (thread 0)
- [ ] Scan the full git history (e.g. gitleaks or trufflehog). Report the findings without printing secret values. For anything real: owner rotation steps first, then remove it from the code
- [ ] Owner steps to turn on secret scanning with push protection, Dependabot alerts and security updates, and CodeQL default setup. Commit `dependabot.yml` (weekly, grouped, npm and GitHub Actions)
- [ ] Turnstile:
  - owner steps for a free Cloudflare account and a widget for `durar.space`
  - the site key as `VITE_TURNSTILE_SITE_KEY`; the secret in Vercel (Sensitive) and in Supabase Auth's CAPTCHA settings
  - wired into the subscribe, sign-up and reset forms, including text-only parity
  - server-side verification in `/api/subscribe`
  - Cloudflare's **test keys** in CI and previews
  - friendly, accessible errors
- [ ] Security headers: a CSP (self, `img.durar.space`, Supabase, Turnstile, nothing else), HSTS, `Cross-Origin-Opener-Policy` and `frame-ancestors 'none'`, plus the existing ones. Report-only on previews first, a Playwright check for zero CSP violations across every page type, then enforce
- [ ] Record in `OPERATIONS.md` how to add a new allowed host to the CSP

### B. Region (thread 0)
- [ ] Functions run in `fra1`. Measure API latency before and after, and confirm the cron, subscribe, confirm, unsubscribe and health check all still work

### C. Data safety (thread 1)
- [ ] **Backups.** Owner steps for:
  - the S3 bucket (Frankfurt, private, versioning, encryption, lifecycle rules)
  - an upload-only IAM user
  - an encryption key pair: the public key is committed; the **private key is kept by Lativ in two safe places**, because without it the backups can't be read
  - GitHub secrets for the database connection (use Supabase's **pooler** connection string; the direct one may not work from GitHub's runners) and the AWS upload key
- [ ] The nightly workflow: dump → encrypt → upload → verify the upload. A failure emails Lativ (GitHub's own failure notification is fine, and a line in the weekly digest)
- [ ] The monthly restore test, as in decision 1
- [ ] A **restore runbook** in `OPERATIONS.md`: how to decrypt, how to restore all of it or one table, and how long it takes. Actually run through it once on staging with fake data
- [ ] **Staging.** Owner steps to create the second free Supabase project (Frankfurt) and put its URL and anon key into Vercel's **Preview** environment. Apply every migration to it. Seed fake users and progress. Email stays sandboxed. No production cron on staging
- [ ] **CI migrations.**
  - Baseline the existing migrations, so the ones already applied by hand are recognized as applied
  - On a PR: apply to staging
  - On merge to `main`: take a fresh backup, then apply to production, behind the "production" environment with Lativ's approval
  - Owner steps for the access token and secrets
- [ ] From now on, every new SQL change in this project goes through this pipeline

### D. Monitoring (thread 2)
- [ ] A lightweight `/api/health` that checks the database and that email settings are present. It sends nothing and reveals no details publicly
- [ ] Owner steps for a free external uptime monitor watching `/`, a word page, `/api/health` and an image on `img.durar.space`, alerting `hello@durar.space`
- [ ] A small error log: API functions record failures (no personal data, kept 30 days)
- [ ] **Weekly digest** to Lativ via pg_cron → a protected route:
  - subscribers (total, new, unsubscribed)
  - emails sent, bounces, complaints
  - accounts (total, new)
  - reviews this week (an aggregate count)
  - The Deep participants
  - last successful backup and restore test
  - error count

  Durar-styled, with a plain-text part, and **aggregate counts only**

### E. GDPR completeness (thread 2)
- [ ] **Download my data** in the account menu: a JSON file with the account email and creation date, saved pearls, progress, subscription status and Deep display name. Only the signed-in user can get their own. Text-only parity
- [ ] Retention:
  - email send logs older than 90 days are deleted
  - the error log after 30 days
  - the existing pending-subscription and IP-hash cleanups keep running
  - document all of it
- [ ] Privacy page, **services that handle data**: Vercel (functions in Frankfurt), Supabase (Frankfurt), AWS (SES, S3 and CloudFront), Cloudflare (Turnstile), Namecheap (email forwarding), Google (only when signing in with Google), GitHub (runs the encrypted backups), the uptime monitor. For each: what it handles, where, and why. Also add the leaderboard section (F)
- [ ] Delete account also removes the Deep entry and anything else new in this phase (tested)

### F. The Deep (thread 3, after thread 1)
- [ ] **A server-side review function** (`record_review(slug, direction)`) applies decision 13. Remove direct insert and update of `word_progress` from signed-in users. Add a sensible rate limit. Move the client's optimistic saving onto this function without changing how it feels
- [ ] **Verified progress:** a per-word flag. Merged browser progress starts unverified and becomes verified on its next server-recorded review. Only verified depth counts toward the board
- [ ] Mastery UI: right-swiping a word that isn't due says e.g. "Already in the deep · returns in 6 days" (also in the live region), and the box doesn't move
- [ ] **Joining:** "Join The Deep" in the account menu and the Library. Choose a name or take a generated one, with a short note on what's shown publicly. Change the name (rate-limited) and leave anytime
- [ ] Name rules: length, allowed scripts, profanity filter (EN + AR), reserved names (durar, admin, …), case-insensitive uniqueness, and bidi-safe display
- [ ] **Boards:**
  - computed by pg_cron (e.g. every 15 minutes) into tables that expose **only** display name, score and rank to everyone
  - your own rank via a function, so no user ids leak
  - the weekly reset at Monday 00:00 Amsterdam
  - tie-break: whoever reached the score first
- [ ] A `/deep` page in Durar's style. Tabs: **This week** / **All time**. The top 10, then your row and "#23 of 140 divers", with scores like "58 pearls in the deep · 212 depth". Signed-out visitors see the board and an invitation to join. `noindex`. Text-only parity. Empty-state copy in Durar's voice
- [ ] Moderation runbook in `OPERATIONS.md`: how Lativ hides a name with one SQL line
- [ ] No rank notifications, emails or badges

### G. The anatomy of a word (thread 4)
- [ ] A static **letter table**: the 28 letters, the hamza forms, ة and ى, each with its Arabic and transliterated name, a simple sound hint, the four shapes, and whether it joins forward. Kept in `src/data/`, so it goes into the native-speaker review
- [ ] **Segmentation:** headword → letters (with their marks) → joins and breaks → count, following the counting rules in decision 19. Run it across every word in CI (500 by the end of this phase) and list anything odd
- [ ] **Syllabifier** with the `syllables` override and the validator warning (decision 18)
- [ ] **The unthread animation** on the focused card: positional shape → standalone shape, the thread with its breaks, the count, then threading back. Slow and weighty, like the rest of the sea. With reduced motion, a fade
- [ ] **Letter detail** on tap: name, sound hint, four shapes. Keyboard: arrows move between letters, Escape closes and returns focus
- [ ] **Syllables step** with the transliteration under each bead
- [ ] **Triggers:** tap the headword, a small labelled button next to save and share, and a shortcut (e.g. `L`). The first-visit help mentions it in one line. Works with pinch-to-zoom
- [ ] **Text-only view parity**, and a screen-reader description, e.g. "دُرَر, 3 letters: dāl, rāʾ, rāʾ. None of them join the next letter. Syllables: du · rar."
- [ ] Lazy-loaded, with a tiny first-paint cost

### H. Content: 500 words (thread 5)
- [ ] First, a plan PR: the target count per topic, and a candidate list of about 200 words (Arabic, transliteration, one-line meaning), with near-duplicates of existing words checked. Lativ approves the list before writing starts
- [ ] Write and import in batches of about 25 through the Sheet pipeline, one PR each, with the preview link and the "uncertain items" list (decision 20)
- [ ] Card images render and upload through CI as usual. Word pages, topic pages and the sitemap update automatically
- [ ] **Scale check at 500:**
  - The word data must not grow the first-paint bundle. If it's bundled today, split or lazy-load it, and report the sizes before and after
  - Search stays instant
  - The 3D scene still mounts only a limited number of cards
  - The anatomy and syllable CI pass covers all 500 words
- [ ] Update the counts in the "What is Durar?" box, the help text and anywhere else that mentions "300"

### I. Tests
- [ ] Unit: the scoring and due-gating, verified merge, name validation, the weekly window across DST
- [ ] Unit (anatomy): segmentation and join rules (every non-joining letter, لا, shadda, hamza forms, ة, ى), counts, the syllabifier and overrides, a CI pass over every word
- [ ] Database:
  - `record_review` rules
  - users **can't** write progress directly
  - the boards expose only name, score and rank
  - leave and delete remove the entry at once
  - RLS on every new table
  - the retention jobs
  - the data export returns only your own data
- [ ] Playwright: Turnstile (test keys) on all three forms; CSP zero violations; join, rename and leave; the generated name; both boards and your rank; signed-out board view; "already in the deep" on a non-due swipe; Download my data; axe clean; RTL names
- [ ] Playwright (anatomy): open and close by tap, button and key; letter detail by keyboard; the syllables step; reduced motion; text-only parity; axe clean. Visual snapshots for دُرَر, سَرَاب, a word with لا and a word with shadda
- [ ] Content: the validator passes on all 500 words; no duplicate or near-duplicate slugs or headwords; Pearl of the Day's past and announced days are unchanged after the import; the first-paint bundle size is checked in CI
- [ ] CI: a backup job dry run against a test database, the restore test, staging migrations on a PR
- [ ] All existing tests still pass, and main stays green

---

## Quality bar (same as every phase)

- **Accessibility:** zero axe violations. Lighthouse 100. Turnstile and the board are fully keyboard- and screen-reader-friendly.
- **SEO:** unchanged at 100. `/deep` is `noindex`.
- **Performance:** first-paint JS grows by no more than about 1 KB. Turnstile and board code load lazily. Report API latency before and after the Frankfurt move.
- **Privacy:** no visitor analytics or cookies. The board shows only chosen names. Every service that handles data is listed.
- **Security:** no secrets in logs or in the repo. CSP enforced.

**Definition of done:** all PRs merged and verified on durar.space, **500 words live**, the first nightly backup and a restore test succeeded, staging in use by previews, migrations flowing through CI, `docs/PHASE-0.7.md` and an updated `OPERATIONS.md` written. Then stop and wait.

---

## Lativ's actions this phase (one ordered list with click-by-click steps in the report)

1. Turn on GitHub's security features. Rotate anything the scan finds.
2. Create the backup bucket and upload user, keep the private key safe in two places, and add the GitHub secrets.
3. Create the staging Supabase project and add its keys to Vercel Preview.
4. Add the migration secrets, and set yourself as approver on the "production" environment.
5. Create the Cloudflare Turnstile widget and add its keys (Vercel and Supabase).
6. Sign up for the free uptime monitor and add the four checks.
7. Approve the list of about 200 candidate words, then review and merge each batch of about 25 (start with the "uncertain items" each PR lists).
8. Later, as part of your word review: the letter table (names and sound hints) and any flagged syllable splits.
9. Still open from 0.6: `SES_RATE_PER_SECOND=5`, the custom MAIL FROM, the word review, the music track.

---

## Backlog (not this phase)

- Email sending that scales to SES's full 50,000 a day.
- **Pronunciation audio:** tap a letter, a syllable or the whole word to hear it. Builds on the anatomy feature's hook.
- Star and flower pictures (draft PR #34), and topic-name refinements.
- A mobile performance pass, streaks, root-family visuals, an optional anonymous "most shared" count, and tightening DMARC.
- **The Deep, later:** an optional quick check (pick the right meaning) before a due word moves deeper, if cheating ever becomes a problem; friends-only boards.
