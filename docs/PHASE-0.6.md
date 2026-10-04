# Phase 0.6 — Content & Topics: report

Live: https://durar.space, deployed from `main` at `4b0157d` (PR #32, merged 4 Oct 08:02 UTC; Vercel
Production READY). The sea now holds **300 words in seven topics**, and each topic has its own page at
`/sea/<topic>`. The live sitemap lists 300 word pages and 7 topic pages (checked 4 Oct). Card images
come from `https://img.durar.space`.

The phase ran from 1 to 4 October, in four threads: carry-over (A), data model and topics (B–E), images
and storage (F), and content (G–H). Two things stand out at the end:

- **GitHub Actions started no jobs from 3 Oct 07:37 UTC to 4 Oct 08:10 UTC.** GitHub's message on every
  job: “The job was not started because recent account payments have failed or your spending limit needs
  to be increased.” The repository, private then, got 2,000 free Actions minutes a month, and October's
  checks used about 2,190 in three days (measured from job timings). Claude's own pushes used them:
  every push to a Claude branch ran the checks twice. PR #33 stops that. On 4 Oct you chose to **make
  the repository public**, which makes the checks free (a scan of the whole git history found no keys or
  passwords). You did that at 08:10 UTC, and the checks run again.
- **Pictures for 22 star and flower words are on hold** (your call, 4 Oct). They are ready in draft
  PR #34.

Legend: **[x]** done and verified · **[~]** built, waiting on the owner or on something I can't reach
from here · **[ ]** not done

## A. Carry-over & polish

- [x] **Main green again.** PR #17 merged 2 Oct 06:25 UTC, and main's CI was green on the merge. It
  fixed the share *Download image* test that had kept main red since PR #15.
- [x] **First-visit help (decision 10).** “How it works” opens by itself on a plain first visit. It
  never covers a shared `/word/<slug>` link (the “?” glows instead), nor an email or sign-in link
  landing. In PR #17.
- [x] **The friend's subscription.** Your friend had created a Durar account, and at the time an account
  never subscribed anyone; the subscribe form itself worked. PR #18 (merged 2 Oct 23:55 UTC) removed the
  silent subscribe failures and renamed the honeypot field so autofill can't trip it. By your decision,
  every confirmed account now gets the daily email, existing accounts too, with Off in the menu (you ran
  both SQL parts on 2 Oct at 23:58 UTC). It relies on Supabase's **Confirm email** staying on.
  Subscribers went from 1 to 3, and on 4 Oct you confirmed your friend received the 07:00 email.
- [~] **Non-Gmail inboxes.** The test script is written (`reports/durar-email-friend-and-inbox-test.md`,
  part 3). **Optional, waiting on you:** subscribe an Outlook and an iCloud address and note whether the
  email lands in the inbox or in spam.
- [~] **Custom MAIL FROM (`mail.durar.space`).** Steps written: section B of your list, and
  [`OPERATIONS.md`](OPERATIONS.md) “Custom MAIL FROM”. Namecheap's Mail Settings switch to Custom MX,
  `hello@` forwarding is kept with Namecheap's five `eforward` MX records, then the `mail` MX and SPF
  records and the SES setting. The root SPF record is never touched, and the steps end with a test of
  `hello@` and the way back. **Waiting on you.**
- [~] **Sending capacity.** [`OPERATIONS.md`](OPERATIONS.md) “Sending capacity”: at
  `SES_RATE_PER_SECOND=1` the morning email reaches about 300 subscribers before 08:00, and at 5 about
  800. The real pace is about 3 a second, because the Vercel functions run in Washington while SES and
  the database are in Frankfurt. At about 600 confirmed subscribers, the next step is a code change
  (sending in parallel), not a higher number. **Waiting on you:** set it to 5 (section A of your list).
- [x] **Alerts.** Suggested, with a recommendation to leave `ALERT_EMAIL` unset: the 08:15 alarm then
  reaches your Gmail directly instead of depending on Namecheap's forwarding. Optional, section C.
- [x] **Branded 404.** PR #21 merged 2 Oct 22:41 UTC. Unknown addresses get a static Durar page (a lost
  pearl, a word search in Arabic or English, and the way back to the sea) with a real **404** status,
  `noindex` and a right-to-left Arabic heading; axe clean in its test. Checked live after the merge.
  The same PR made `vite preview` serve pages the way Vercel does and raised CI's time limits after
  slow-runner timeouts (90 s per test, 30 minutes per job).
- [~] **Music (PR #16).** Built to decision 9: off by default, one invite ripple on a first visit,
  sound only after a tap, paused in background tabs, Safari's silent switch respected, the choice
  remembered, and nothing loaded until asked. **Waiting on you:** your track and one credit line.
- [x] **Google brand.** Verified: on 4 Oct Google's Branding page said “Your branding has been verified
  and is being shown to users”. That should replace the Supabase address on Google's account picker with
  Durar's name (not checked from here). Decision 11's fallback isn't needed.

## B. Data model (PR #20, merged 3 Oct 00:06 UTC)

- [x] `src/data/topics.json`: id (its `/sea/<id>` address), English and Arabic name and description,
  order and an optional cover.
- [x] Words list their `topics` (migrated from `tags` by `scripts/migrate-tags-to-topics.mjs`) and an
  `added` date, with an optional `image` and `etymology`. The topic names and the tag mapping are
  Claude's proposal; you'll review them in a later refinements phase.
- [x] The validator (`scripts/lib/word-schema.mjs`) enforces a vowelled headword, the transliteration
  format, 1–3 examples, known topic ids, the `added` date, a source on every borrowed word's etymology,
  credit, licence and alt text on images, and unique slugs. A topic under 20 words is a warning.
- [x] No `/word/<slug>` address changed, so saved pearls and progress still match. The original 140
  words got `added: 2026-09-24`, Pearl of the Day's first day, so every day's pearl is unchanged (a
  unit test compares four years of the schedule).

## C. Topic picker (PR #22, merged 3 Oct 07:07 UTC)

- [x] A **“The whole sea”** button next to search opens an accessible menu of the topics, in English
  and Arabic (arrow keys, Home/End, Escape; axe clean). Empty topics stay hidden.
- [x] Picking a topic sinks the cards on screen and brings up that topic's words. With reduced motion
  they fade in place instead.
- [x] The choice is remembered on the device and, when signed in, on the account (`sea_topic` in the
  Supabase user's metadata: no new table and no SQL step). A plain visit to durar.space reopens it,
  while a shared `/word/<slug>` link always opens the whole sea.
- [x] The address becomes `/sea/<topic>` and the page title names the topic. Today's pearl comes first
  when it belongs to the topic.
- [x] Mastery reviews follow the topic. When nothing is new or due there, a note offers “Swim in the
  whole sea”.
- [x] Works in the text-only view (covered by the topics browser test).

## D. Topic pages & SEO (PR #22)

- [x] Prerendered `/sea/<topic>` pages in English and Arabic, with the topic's word list, structured
  data and unique meta, all in the sitemap. For a live visitor, a topic page opens the sea filtered to
  that topic. Word pages link to their topics.
- [ ] **A topic image** (cover plus signature) for link previews isn't built. Topic pages use the
  site's default card for now. No topic has a cover picture yet.
- [~] **SEO 100** wasn't re-measured with Lighthouse this phase.

## E. Search, Library, sharing, email (PR #31, merged 3 Oct 07:39 UTC)

- [x] Search shows the chosen topic's matches first, and each result carries chips naming its topics.
- [x] The Library has a topic filter, with a friendly note when a topic has no saved pearls.
- [x] The Pearl of the Day email gets a line like “From Sea & water · البحر والماء”, linking to the
  topic's page, in both the HTML and the plain-text versions.
- [ ] **The share image and the 3D card don't draw a word's illustration yet.** On `main`, pictures
  appear only on `/credits`. This belongs with the pictures that are on hold (see H).

## F. Images & storage (PR #19, merged 3 Oct 06:22 UTC)

- [x] Cost estimate first; you approved it on 2 Oct.
- [x] All your AWS and Namecheap steps are done: a $1 budget alarm, the private bucket
  `durar-space-images` in Frankfurt, the certificate, **CloudFront on its free flat-rate plan ($0)**,
  the `img` CNAME, and an upload-only IAM user whose keys are GitHub secrets.
- [x] CI renders whatever card images `img.durar.space` doesn't have yet and uploads them under hashed
  names worked out from the data, so there is no manifest and **no manual card step any more**.
- [x] The 282 card PNGs (16 MB) left the repository; git history is untouched. Old
  `durar.space/cards/…` links redirect to the image host.
- [x] Link-preview and email images load from `img.durar.space` (checked live after the merge). The
  Privacy page names the image host.
- [x] An illustration pipeline (a public-domain or CC0 plate from Wikimedia Commons, restyled by CI into
  aqua line art) and a **Credits** page at `/credits`, linked from Privacy and “What is Durar?”. One
  word has a picture so far: وَرْد, the rose.
- Note: uploads run in CI's `images` job, so new cards and pictures wait while Actions is down. All 600
  card images for the 300 words were already uploaded by the batch pull requests before it stopped.

## G. Content pipeline (PR #23, merged 3 Oct 06:44 UTC)

- [x] **The Google Sheet.** You set it up on 4 Oct from the owner steps
  (`phase-0.6/durar-sheet-your-steps.md`). The test import found “Nothing to change: the Sheet matches
  the repo”, with all 300 words in their seven topics.
- [x] `scripts/import-sheet.mjs` reads the published CSVs, validates every row, and writes the data files
  only if all are valid. **Actions → Import from the Sheet** then opens a pull request listing new,
  changed and removed words, words per topic, and what is still unreviewed. Removals are refused unless
  “Allow removals” is ticked. Exporting and re-importing gives identical files (tested).
- [x] The pull request has the Vercel preview link.
- [x] A `draft` / `reviewed` status per word (no status means draft). Both show on the site.
- [x] [`CONTENT.md`](CONTENT.md): how a batch reaches the site, the Sheet's columns, the style guide and
  the licensing rules (decision 8).

## H. First batches

- [x] **160 new words** were written fresh, taking the sea from 140 to 300. Every topic now passes 20:
  Sky & stars 59, Sea & water 52, Feeling & virtue 49, Words the world borrowed 49, Poetry & language
  45, Desert 42, Flowers & scent 41.
- [x] Delivered as seven batches of about 25 (PRs #24–#30), which you merged on 3 Oct. Batches 2–7
  reached `main` through PR #32 on 4 Oct (see *What went wrong*).
- [~] **Sources and review.** 71 words carry an etymology with a recorded source (required for every
  borrowed word). They were written from Claude's own knowledge, because the dictionary site couldn't be
  opened from here, so they need your reading. No word is marked `reviewed` yet: the native-speaker
  review of all 300 is still to come.
- [ ] **Pictures for the flower and star words.** On hold by your decision (4 Oct). Draft PR #34 has 14
  public-domain plates (Hevelius's star atlas, 1690, and Redouté's lilies, 1802–1816) for 22 words. It
  needs Actions to fetch, check and render them.

## I. Tests

- [x] Each pull request added its unit and browser tests: the validator, the tags → topics migration,
  the topic-filtered queue, the image URL lookup, the picker, topic pages, the
  remembered choice, search chips, the Library filter, the email line, the 404 page, first-visit help
  on a shared word, music off by default, and the Credits page.
- [x] **Main's checks are green.** PRs #24, #31 and #32 merged while Actions was down and were checked
  locally then (Thread 1: build and unit tests after #31; Thread 3: data checks, typecheck, 191 unit
  tests and the full browser suite, 134 of 134, on #32's content). Once Actions worked again, GitHub's
  full checks passed on `main` at `4b0157d` (#32) and at `cc57d1a` (#33) on 4 Oct. Before merging,
  test merges also caught two tests that broke only in combination (#23's word counts and #22's
  “borrowed is hidden” test with #24's words); both were fixed before #24 merged.

## Quality bar

- **Accessibility:** the new picker, 404 page and Credits page are axe clean in their tests. Every
  picture has alt text (the validator requires it). Music never starts on its own.
- **Performance:** the picker adds about 1.6 KB of gzipped first-paint JavaScript (the bar is about
  1.5 KB). Topic descriptions are kept out of the app bundle. Images and music are lazy.
- **Lighthouse** (live) wasn't re-measured this phase.
- **Privacy:** no tracking added. The image host is named on the Privacy page.
- **Licensing:** pictures must be public domain or CC0 (the validator enforces it) and are credited on
  `/credits`. Every borrowed word's etymology names its source. No dictionary text was copied.

## Your steps (one ordered list)

The click-by-click version, kept up to date, is `reports/durar-phase-0.6-your-steps.md` in the project
files:

1. Read the new words' examples, diacritics and etymologies.
2. Raise `SES_RATE_PER_SECOND` to 5.
3. Add the custom MAIL FROM.
4. Optional: `ALERT_EMAIL`.
5. Optional: the Outlook and iCloud subscribe test.
6. Send your music track for PR #16.

Done: #17, #21, #18, #20, the image-storage steps, #19, #23, #22, #24–#31, #32, making the
repository public, #33, Google's brand check, and the Google Sheet.

Deferred (your call, 4 Oct): confirming or renaming the seven topics and the tags → topics mapping
waits for a later refinements phase; the focus first is the full backend.

## What went wrong

- **The stacked batches.** Batches 2–7 were each opened on top of the batch before. This repository
  keeps merged branches, so GitHub never moved them onto `main`: they merged into each other, and the
  site showed 163 words instead of 300 until PR #32. Content threads no longer stack pull requests.
  Optional: GitHub's **Settings → General → Automatically delete head branches** would make stacked
  pull requests move onto `main` by themselves.
- **The Actions minutes.** Every push to a Claude branch ran the whole workflow twice (once for the
  push and once for the pull request), and the batch re-pushes added up. PR #33 tests each change once,
  stops a pull request's older run when a newer push arrives, and skips changes to `docs/` and the
  README alone.

## Next

- Your focus next (4 Oct): the full backend. Reviewing the topics waits for a later refinements phase.
- From this phase: the pictures (#34) when you want them, together with drawing them on the 3D card and
  the share image and giving topics a link-preview image; the native-speaker review; a live Lighthouse
  check.
- 0.7 (from the checklist's backlog): a mobile performance pass on the 3D scene, streaks, pronunciation
  audio, root-family visuals, an optional anonymous “most shared” count, and tightening DMARC.
