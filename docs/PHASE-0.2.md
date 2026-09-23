# Phase 0.2 — Accounts & Personal Library: report

Preview (private, single-file build with **browser-only demo accounts**, no email step):
https://claude.ai/artifact/A71zLZPK1zRW3nWbferAHZ

The live Vercel site and real Supabase sign-in need accounts only the owner can create. Everything is
built and tested against a mock backend and a real PostgreSQL server. The owner steps are in
[`ACCOUNTS-SETUP.md`](ACCOUNTS-SETUP.md) and summarised under “Needs your input”.

Legend: **[x]** done and verified · **[~]** built, needs the owner's accounts to verify live ·
**[ ]** not done

## Checklist

### A. Hosting & carry-over from 0.1
- [~] Deploy to Vercel with `SITE_URL` set. `vercel.json` is ready. `SITE_URL` comes automatically from `VERCEL_PROJECT_PRODUCTION_URL`. Tests check the sitemap, `robots.txt`, canonical and `og:url` output on a build with `SITE_URL` set. **Waiting on the owner to connect Vercel.** No deployment exists yet (the repo has no `main` branch and no PRs).
- [~] Preview deployments per branch/PR. Vercel does this by default once connected; the Supabase redirect wildcard for previews is documented.
- [~] Lighthouse against the live URL: not possible until it's deployed. Results against the production build served locally are below.

### B. Backend setup
- [x] Supabase config via env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). `.env.example` is committed and `.env*.local` is git-ignored. Without the vars the site runs exactly as in 0.1, with accounts hidden.
- [x] `saved_pearls` table: `user_id` (→ `auth.users`, cascade delete, defaults to `auth.uid()`), `word_slug`, `created_at`, primary key (`user_id`, `word_slug`). There's also a slug-format check and a 1,000-per-user cap.
- [x] Row Level Security: select, insert and delete only your own rows. No update grant. Signed-out users (anon) get nothing. **`tests/db/rls.test.mjs`: 13 tests against real PostgreSQL 16, including “user B cannot read, insert or delete user A's pearls”.** It runs in CI as its own job.
- [x] Versioned migration: `supabase/migrations/20260924000000_saved_pearls.sql`. The test suite rebuilds the database from scratch using it.
- [x] Unknown slugs (e.g. a renamed word) are skipped quietly in the Library and counts (tested with a `retired-word` row).

### C. Authentication
- [x] Email + password sign-up with email verification (“Check your inbox” screen, resend link, pending save kept while waiting).
- [x] Log in, log out, “forgot password” → reset link → choose a new password (PKCE flow, including the “link opened in another browser” case).
- [~] Google sign-in through Supabase, with redirects that return to the same page. Tested with the mock. **Needs the owner's Google OAuth client** (steps provided).
- [x] Session persists across reloads. A stored session shows a quiet placeholder pearl rather than flashing “Sign in”.
- [x] Sign-in is a dark-glass sheet over the scene (bottom sheet on phones) with a pearl accent and IBM Plex Sans Arabic UI text. It traps focus, closes on Escape or a backdrop click, makes the page behind it inert, and returns focus to whatever opened it.
- [x] Account entry in the top-left corner, opposite search. Signed out it reads “Sign in”. Signed in it's a pearl showing your initial, opening a menu with **My Pearls** (with count), **Privacy**, **Sign out** and **Delete my account…**. The menu works with arrow keys, Home/End and Escape.
- [x] Human error messages: wrong password, unconfirmed email (with a “send the link again” action), email already in use (including Supabase's silent response for existing addresses), weak password, rate limits, network failure.

### D. Save to My Pearls (main scene)
- [x] Save control on the **focused card only**: an outline pearl when unsaved, a lustrous filled pearl when saved. It is pinned to the 3D card's corner every frame and fades while the card moves.
- [x] `S` saves or unsaves, alongside `/`. It's in the on-screen hint (“S to save”), the button's `aria-keyshortcuts` and its tooltip.
- [x] Confirmation is a glint of light running once around the card's nacre rim (shader). With reduced motion it's a soft rim brightening instead. No toast.
- [x] Optimistic update with rollback and a short visible message if the request fails. A per-word version counter stops slow responses from overriding newer taps. Requests use `keepalive`, so a save finishes even if the tab closes right after.
- [x] Signed out + save opens the sign-in sheet with “Sign in to keep this pearl · <word>”. After sign-in or sign-up the word is **saved automatically** and the same card stays in focus. This also works across email-link and Google redirects (the pending save is kept for 24 h). Closing the sheet cancels it.
- [x] Same control and glint in the text-only view.
- [x] `aria-pressed` with a fixed label (“Save نَجْم to My Pearls”), and a polite live region announcing saved, removed and failed.

### E. Library page (`/library`)
- [x] Signed-in only. Signed-out visitors see a friendly sign-in prompt, not an error.
- [x] Same water and light as the sea, drawn in CSS: loads instantly and scrolls. Lighthouse Performance on it is 100.
- [x] Small pearl cards: Markazi Text headword (`lang="ar" dir="rtl"`), transliteration, first meaning.
- [x] Sort by Newest (default) or Alphabetical (أ–ي: Arabic collation, ignoring diacritics). The choice is remembered on this device.
- [x] Remove with a 7-second **Undo** (focus moves to Undo). Undo restores the original save date, so the pearl returns to its place.
- [x] Clicking a pearl returns to the sea at `/word/<slug>` and that pearl rises into focus. Back and Forward work.
- [x] Empty state: “No pearls yet. Dive in and keep the ones that stay with you.”
- [x] Count (“1 pearl” / “12 pearls”).
- [x] `noindex` in the prerendered HTML and at runtime; not in the sitemap; no canonical tag.

### F. Account basics & privacy (EU-friendly)
- [x] **Delete my account** in the menu. A confirmation dialog defaults to “Keep my account”. `delete_my_account()` removes the auth user and every saved row (covered by the RLS suite).
- [x] Plain-language **Privacy** page (`/privacy`): what's stored, why, where (Supabase region from `VITE_DATA_REGION`), browser storage, and how to delete. It's linked from the sign-in sheet and the account menu.
- [~] EU region: Frankfurt (`eu-central-1`) is recommended in the setup guide. The owner picks it when creating the project.
- [x] No tracking, no analytics, **no cookies**. The session and the pending save use `localStorage`, strictly necessary for features the visitor asks for, so **no cookie banner is needed**. Google profile photos are deliberately not loaded (the avatar is an initial on a pearl).

### G. Tests
- [x] Playwright auth: sign up → verify → sign in, session across reload, sign out, errors, password reset request + recovery, Google, focus trap, account deletion, privacy link. These run against the in-browser **mock backend**, which is reliable in CI with no network.
- [x] Playwright save/unsave: mouse, `S` key, touch (Pixel 7 emulation), failure rollback, text-only view.
- [x] Signed-out save → sign in → saved automatically, same card focused (plus the sign-up and Escape-cancels variants).
- [x] Library: list, count, both sorts, remove + undo, removal persists, click opens the sea, Back returns, empty state.
- [x] `/library` signed out shows the sign-in prompt, then the list after signing in.
- [x] RLS tests run in CI (`database` job with a PostgreSQL 16 service).
- [x] All 18 tests from Phase 0.1 still pass. **Total: 42 Playwright tests, including 4 axe WCAG 2.1 AA scans, + 13 database tests.**

## Quality bar

- **Accessibility:** axe reports zero WCAG 2.1 A/AA violations with the sign-in sheet open, the account menu open, the Library (signed in and out), the delete dialog and Privacy. Lighthouse Accessibility is **100** on every page tested. Everything new works by keyboard with visible focus, and dialogs trap and return focus.
- **SEO:** word pages are unchanged and score **100**. `/library` is `noindex`, so its SEO score is 63 by design (Lighthouse reports “page is blocked from indexing”). `/privacy` scores 100 and is in the sitemap.
- **Performance:** the accounts client is its own lazy chunk (59.7 KB gzip), loaded after the scene is up, or immediately only when an auth redirect lands.

  | | Phase 0.1 | Phase 0.2 |
  | --- | --- | --- |
  | Main JS (gzip) | 89.2 KB | 94.6 KB (+5.4) |
  | CSS (gzip) | 4.8 KB | 8.1 KB (+3.3) |
  | 3D scene chunk (lazy) | 244.1 KB | 244.7 KB |
  | Accounts client (lazy) | — | 59.7 KB |
  | Sign-in sheet / Library / Privacy (lazy) | — | 2.6 / 1.7 / 1.2 KB |

- **RTL:** every Arabic string in the sheet, the undo bar, the Library, the sort control and the announcements carries `lang="ar"` and `dir="rtl"` where it's a block.
- **Motion:** the glint becomes a brightening, and Library animations and light rays stop, under `prefers-reduced-motion`.

### Lighthouse (production build served locally, headless Chromium with software WebGL)

| Page | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| `/word/bahr`, desktop | 68 | 100 | 100 | 100 |
| `/word/bahr`, mobile | 48 | 100 | 100 | 100 |
| `/library`, desktop | 100 | 100 | 100 | 63 (noindex by design) |
| `/privacy`, desktop | 100 | 100 | 100 | 100 |

Word-page performance is unchanged from 0.1 (68 / 49–67). The accounts code isn't loaded during the measured window. These numbers need re-running on the live Vercel URL.

## Also changed

- Security headers on Vercel: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`.
- The Save control's position snaps to whole pixels, so it drifts with its pearl without shimmering.
- Card motion keeps near-real-time pacing on very slow devices (frame-time cap raised from 0.1 s to 0.25 s).
- The preview build uses a browser-only demo backend, so the preview link can show the whole flow.

## Needs your input

1. **Vercel:** import the repo and pick the production branch (details in the setup guide). Send me the URL and I'll check sitemap, canonical and `og:url` live and re-run Lighthouse there.
2. **Supabase project:** create it (free tier, **Frankfurt** region), run the migration, set the auth settings and redirect URLs, and put the URL and anon key into Vercel's environment variables. Step by step: [`ACCOUNTS-SETUP.md`](ACCOUNTS-SETUP.md) §2 and §5. Or tell me and I'll walk you through it live.
3. **Google OAuth client:** create it in Google Cloud Console with redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`, then paste the client ID and secret into Supabase ([`ACCOUNTS-SETUP.md`](ACCOUNTS-SETUP.md) §3).
4. **Email delivery:** Supabase's built-in mailer only sends to your own Supabase team, at 2 emails per hour, so **real visitors won't receive confirmation or reset emails until custom SMTP is set up**. Recommended: Resend's free tier (already planned for Phase 0.3). This needs a domain you control for the sender address.
5. **Privacy contact:** set `VITE_CONTACT_EMAIL` so the Privacy page names a contact. GDPR expects one.
6. **Custom domain (optional):** if you add one, update Vercel, then the Supabase Site URL and redirect URLs, then Google's JavaScript origins. No code changes.
7. **Free-tier pausing:** Supabase pauses free projects after about a week of low activity. Browsing keeps working (the words are static), but sign-in and saving stop until you restore the project from the dashboard (possible for 90 days). Upgrading to Pro prevents pausing but is a paid plan, so that's your decision.

## Still open from 0.1

- Native-speaker review of the 140 words.
- Real-device performance check on a mid-range laptop and phone.
