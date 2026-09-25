# Phase 0.4 — Sharing: report

Live: https://durar.space. Production deploys from `claude/new-session-id31u5`, not `main`: Vercel's
production branch was never switched (same code as `main` today; see “Needs your input”). Checked live
on 2026-09-25: production runs this phase, including the sharper card text.
Preview with browser-only demo accounts: https://claude.ai/artifact/A71zLZPK1zRW3nWbferAHZ

Legend: **[x]** done and verified · **[~]** built, waiting on the owner or on something I can't reach
from here · **[ ]** not done

> **Live check, 2026-09-25** ([results](#live-check-results-2026-09-25)), **updated 21:30 UTC**
> ([Vercel follow-up](#vercel-follow-up-2026-09-25-evening)). Sharing, the SEO tags, the sitemap and the
> Privacy contact all work on durar.space, and Lighthouse ran live. The three Vercel fixes from the first
> check are done: the Supabase key, `www.durar.space` (308, with its own certificate) and the vercel.app
> host (308, `/api/` left alone). The `/api` functions start again since 21:26 UTC (`/api/cron/daily`
> answers 401 instead of 500). **Still open:** `CRON_SECRET` for the daily email, and Vercel's production
> branch is still `claude/new-session-id31u5`. See “Needs your input”.

## Checklist

### A. Carry-over from 0.3 and domain day
- [x] **durar.space everywhere.** `SITE_URL` defaults to `https://durar.space` (then Vercel's production domain), so canonicals, `og:url`, `og:image`, the sitemap, `robots.txt`, email links and share links all use it. Checked on a simulated production build. **New:** `vercel.json` permanently redirects (308) `www.durar.space` and `arabic-lang-project.vercel.app` to `durar.space`, keeping the path. `/api/…` is left alone so an older scheduler URL keeps working. Preview URLs aren't redirected. **Live:** the tags, sitemap and `robots.txt` are right, and since the evening of 2026-09-25 both hosts redirect with a 308 (live check item 1).
- [x] **Server functions on production.** Until 21:26 UTC every `/api` function (subscribe, confirm, unsubscribe, cron/daily) answered 500, because Production had none of the server-side variables from [`EMAIL-SETUP.md`](EMAIL-SETUP.md) §2. Two are needed before any function starts: `SUPABASE_SERVICE_ROLE_KEY` and `EMAIL_TOKEN_SECRET`. You added both and redeployed; `/api/cron/daily` now answers 401. The daily email still needs `CRON_SECRET`, then the SES keys, `EMAIL_FROM` and `EMAIL_SANDBOX_TO` (DOMAIN-DAY Part 7). Details under [Vercel follow-up](#vercel-follow-up-2026-09-25-evening).
- [x] **Owner steps**, click by click: [`DOMAIN-DAY.md`](DOMAIN-DAY.md). Covers Vercel domains and `SITE_URL`, Supabase Site URL and redirects, Google sign-in (origins and the authorized domain `durar.space`), SES domain verification (DKIM, SPF, DMARC and custom MAIL FROM, written for Namecheap's Host field), the production-access request text, Supabase SMTP via SES, turning **Confirm email** back on, and going live. You said you'd do these later.
- [x] **Subject style b** is the default: `Pearl of the Day: سَرَاب (sarāb)`. You can delete `EMAIL_SUBJECT_STYLE`.
- [~] **`EMAIL_MODE=live` and `EMAIL_SIGNUP=on`:** both stay off until SES production access is approved and a test lands in the inbox (DOMAIN-DAY Part 7). No code change is needed.
- [~] **Live verification:** run on 2026-09-25 (results under “Live check”). Share, the SEO tags, Privacy and both host redirects pass. At the first check, sign-up, Google, save and delete account failed because Vercel held placeholder text instead of the Supabase key. The key has been fixed since 20:31 UTC, and you're testing sign-in yourself: sign-up, save and delete account aren't run from here against production. Subscribe waits for domain day.
- [x] **Live Lighthouse:** run on 2026-09-25. The numbers are under “Quality bar”, after the local ones.
- [x] **Inbox-test checklist:** below. Results go in the table once you have them.

### B. The share image
- [x] **1080×1920 PNG drawn in the browser** from the focused word (`src/share/image.ts`). Water gradient lit from above with slanting light shafts. The card has a nacre gradient and the iridescent conic rim. Then the Markazi Text headword with full diacritics and a soft glow, the letter-spaced transliteration, the hairline-and-pearl ornament, the meaning(s), and one example: Arabic drawn right-to-left, then the English (and the source, for quotations).
- [x] **The signature is always drawn**, by a single `drawSignature` step at the end of `renderStory`. `renderStory` is the only way to get pixels out, and share, download and the text-only view all use it: **دُرَر** in Aref Ruqaa with **durar.space** beside it, slanted −4° like a signature, bottom-right on the card. The whole card, and so the signature, sits between 14% from the top and 20% from the bottom (y 274–1531 of 1920; signature at about y 1400–1480).
- [x] **Auto-fit:** the layout (`layout.ts`) finds the largest scale where everything fits between the card top and the signature. A long headword shrinks first, then wraps only if it must. Wrapped lines are balanced so no word is left alone on the last line. The text never enters the signature's area. Unit-tested with extreme made-up words (a 5-word headword, 7 meanings, a 14× example) and every word in the dataset.
- [x] **Fonts first:** reuses `loadCardFonts()` from `fonts.ts`, and also loads Aref Ruqaa (already self-hosted for the wordmark).
- [x] **File name** `durar-<slug>.png`. **Description** `سَرَاب (sarāb): mirage` is embedded in the PNG (iTXt “Description”, UTF-8) and used as the share `title`.
- [x] **Same look as the static card images:** same palette, card gradient, rim colours, type and signature style. The static images are unchanged.

| | |
| --- | --- |
| Image | 1080×1920 PNG, ~1.6 MB |
| Drawing | ~8 ms (desktop) · ~35 ms at 4× CPU slowdown |
| Drawing + PNG encoding | ~0.17 s (desktop) · **~0.75 s at 4×** (roughly a mid-range phone) · ~1.2 s at 6× |

Phones don't wait for this: the image is drawn in idle time before the tap. On desktop, Download shows the “preparing” state (the icon dims and breathes) only if it takes more than 150 ms.

### C. Share on phones
- [x] **One Share icon** opens the system share sheet with the image file, the text and the link.
- [x] **iOS gesture rule:** once the focused card has settled (1.2 s), the phone loads the share code and draws that card's image during idle time. The tap then calls `navigator.share()` synchronously, with nothing awaited first. A test checks that the share call happens inside the tap. If someone taps before the image is ready, it's drawn and shared. If iOS then refuses (the tap has “expired”), a quiet “Image ready. Tap Share again.” appears, and the second tap shares at once.
- [x] **Fallbacks, in order:** no file sharing (`canShare` says no, or the browser rejects the file) → the link and text only. No share sheet at all → the menu from D.
- [x] **Cancel does nothing:** no error, no message, no menu (tested).
- Phones are detected as touch-first (`pointer: coarse`) with `navigator.share`. Desktop browsers that have a share API still get the menu, as decided.

### D. Desktop menu
- [x] A dark-glass popover under the Share icon, in the account menu's style (a little more opaque, since it opens over the card's own text):
  - **WhatsApp:** `https://wa.me/?text=…` with the text and link, opened in a new tab. WhatsApp's preview shows the card image from `og:image`.
  - **Copy link:** copies the canonical URL. The menu closes and **“Link copied”** appears under the icon for 2.6 s. It's announced politely to screen readers.
  - **Download image:** saves `durar-<slug>.png`, the signed 9:16 image.
- [x] **Keyboard:** Enter/Space opens it with focus on the first item. ↑/↓ wrap, Home/End work, Escape closes and returns focus to Share, Tab moves on, and a click outside closes it. Inside the menu, ←/→ no longer swipe the card and S no longer saves. Roles: `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`, `role="menu"` labelled “Share سَرَاب”, and `role="menuitem"`.

### E. Share text
- [x] `سَرَاب (sarāb) — mirage · a pearl from Durar`, then the link on its own line.
- [x] Today's pearl: `دُرَّةُ اليَوْم · Today’s pearl: سَرَاب (sarāb) — mirage`, then the link.
- [x] **One builder** (`src/share/text.ts`) for the share sheet, WhatsApp and the image description. It uses Unicode isolates around the Arabic and a left-to-right mark at the start, so the line reads correctly in both directions and in any app. Links are always `https://durar.space/word/<slug>` with no parameters.

### F. Placement & behaviour
- [x] The Share icon sits **left of the save pearl** on the focused card only, with the same pearl-ring style. Each has a 44 px target, and their centres are 46 px apart, so they read as a pair without touching. It's pinned to the card and fades while it moves, exactly like save (same anchor). **It shows without an account.** When accounts are off, it's alone in the corner.
- [x] **Text-only view:** the same controls in the card's corner.
- [x] **Tab-reachable**, labelled “Share سَرَاب”, with the tooltip “Share”. No new shortcut.
- [x] **Lazy:** the image renderer, share logic and text builder (4.1 KB gzip) and the menu (0.8 KB) load on first use. On desktop they load on hover/focus, on phones in idle time. **First-paint JS +0.64 KB gzip** (96.56 → 97.20 KB). CSS +0.19 KB (8.71 → 8.90 KB).
- [x] **Reduced motion:** the menu's rise, the “Link copied” note and the “preparing” breathing all fall under the site's reduced-motion rule (no movement).

### G. Tests
- [x] **Unit (15 new):** share text (both variants), canonical URL (no query, every word), the WhatsApp encoding, file name and description (7). Story geometry inside the safe area, and auto-fit for extreme and real words (8).
- [x] **Image:** visual snapshots of the downloaded image for a short word (`nur`), the longest headword (`tumaninah`), two meanings (`durrah`) and the longest example (`azal`). The snapshots are stored at quarter size to keep the repo small. **Signature check on every export path**, on the phone share file, the desktop download and the text-only download: a 1080×1920 PNG, the signature region has ink, and it matches its snapshot. The signature region is also byte-identical across the four words, which proves the text never reaches it.
- [x] **Playwright, phone** (Pixel 7, mocked `navigator.share`): called from the tap with `durar-nur.png` (1080×1920, image/png, signed, described), the canonical URL and the text; the link-only fallback; cancel gives no error or message; no share sheet → the menu; one icon, on the focused card only.
- [x] **Playwright, desktop:** Tab reaches Share, and the menu works by keyboard (arrows, Home/End, Escape returning focus, arrows don't swipe); the WhatsApp link's encoding (only a `text` parameter, exact text and link, `noopener noreferrer`); today's variant; Copy link (clipboard contents, “Link copied”, focus back on Share); Download (`durar-nur.png`, signed, described); Share and save side by side with 44 px targets; **axe: zero violations with the menu open**.
- [x] **Text-only parity:** one Share on the card, the keyboard menu, a signed download, and axe clean (desktop), plus the share sheet (phone).
- [x] All existing tests still pass.

**Totals: 79 Playwright (16 new) · 32 database · 47 unit/server (15 new), all passing.**

## Quality bar

- **Accessibility:** zero axe violations with the share menu open, in both views. Lighthouse Accessibility 100. Everything works by keyboard and returns focus. “Link copied” and “Image ready” are announced politely. The Share button is `aria-busy` while preparing.
- **SEO:** word pages stay at 100. Canonicals unchanged apart from the durar.space move.
- **Performance:** share code is lazy. First-paint JS +0.64 KB gzip. The image takes about 0.75 s at 4× CPU slowdown, and phones draw it ahead of the tap.
- **RTL:** the image draws Arabic right-to-left with the browser's own shaping. The menu is labelled with the Arabic headword. The share text uses isolates so mixed Arabic and English order correctly.
- **Privacy:** no tracking. No share counts, no UTM or other parameters, no third-party SDKs. WhatsApp is a plain `wa.me` link opened only when chosen.

### Lighthouse (production build served locally; headless Chromium, software WebGL)

| Page | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| `/word/bahr` desktop | 68 | 100 | 100 | 100 |
| `/word/bahr` mobile | 48–51 (two runs) | 100 | 100 | 100 |

The same as in 0.3 (68 / 50).

### Lighthouse, live (https://durar.space, 2026-09-25)

Lighthouse 13.5.0 and headless Chromium 141 with software WebGL, run from a cloud container through its
network proxy. The proxy sometimes dropped a file (a 502 on a script or font; every response that
came back from Vercel was a 200), so each run was checked and any run with a missing file was re-run.
Three clean runs each:

| Page | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| `/word/bahr` desktop | 64 · 65 · 66 | 100 | 100 | 100 |
| `/word/bahr` mobile | 68 · 65 · 39 | 100 | 100 | 100 |

Medians: desktop FCP 0.47 s, LCP 0.47 s, TBT 1.35 s, CLS 0 · mobile FCP 2.0 s, LCP 2.0 s, TBT 2.5 s,
CLS 0. The mobile 39 is an outlier: its files came slowly through the proxy (first paint 4.3 s). Most of
the blocking time is the 3D scene starting up (the `Experience` chunk and the main bundle), as in the
local runs. Software WebGL makes that heavier than on a real device's GPU.

## Inbox test (for you)

Send one test (DOMAIN-DAY Part 7, step 3), then check each client. For each, note ✓ or what looked wrong:

| Client | Inbox, not spam | Arabic reads right to left, letters joined | Readable with images off | “Open in Durar” opens the word | Unsubscribe works | Dark mode OK |
| --- | --- | --- | --- | --- | --- | --- |
| Gmail web | | | | | | |
| Gmail iOS | | | | | | |
| Gmail Android | | | | | | |
| Apple Mail (iPhone or Mac) | | | | | | |
| Outlook (web or app) | | | | | | |

Also check that Gmail and Apple Mail show their own “Unsubscribe” link near the sender (it appears once DKIM is set up).

## Live check (once durar.space is reachable)

1. `https://www.durar.space/word/bahr` and `https://arabic-lang-project.vercel.app/word/bahr` both land on `https://durar.space/word/bahr`.
2. View Source on a word page: canonical, `og:url` and `og:image` are on `https://durar.space`. `/sitemap.xml` lists durar.space.
3. Sign up with email (the confirmation email arrives and signs you in), then Google sign-in.
4. Save a pearl → it's in My Pearls → remove it → Delete account.
5. Subscribe → confirm from the email → unsubscribe from the email's link.
6. Privacy page shows the contact address.
7. Share on desktop: WhatsApp, Copy link, Download image.
8. Lighthouse on `/word/bahr`, desktop and mobile.

### Live check results (2026-09-25)

Run from a cloud container with headless Chromium 141 through its proxy. Every request to Supabase
was blocked in the browser, so nothing touched the production database.

| # | Check | Result |
| --- | --- | --- |
| 1 | Host redirects | ✓ **Both fixed (re-checked 21:12 UTC).** **`www.durar.space`:** 308 → `https://durar.space/word/bahr?x=1`, keeping the path and query, with its own certificate. At the first check it had none: Vercel presented the `durar.space` certificate, so browsers showed a security warning. The domain wasn't on the project; it was added at 21:09 UTC as a Domains-page redirect to `durar.space` (308), and its certificate was live by 21:12. That redirect runs before `vercel.json`, so it also sends `www.durar.space/api/…` to durar.space. Nothing calls that address. **`arabic-lang-project.vercel.app`:** 308 → `https://durar.space/word/bahr?x=1` from `vercel.json`, and `/api/…` isn't redirected. At the first check this was a 302 set on the Domains page, which also caught `/api/…`. It serves Production again since 20:36 UTC. |
| 2 | Tags and sitemap | ✓ `canonical`, `og:url`, `og:image`, `twitter:image` and the JSON-LD `url` are all on `https://durar.space`. `/sitemap.xml`: 142 addresses, all `https://durar.space/…`, no `/library`. `robots.txt` points at it. The `og:image` loads (1200×630 PNG). |
| 3 | Sign-up, Google | **Key fixed; you're testing this.** At the first check it was broken for every visitor: Vercel's `VITE_SUPABASE_ANON_KEY` held the text “the anon or publishable key from Supabase → Project Settings → API Keys” instead of the key. Browsers refuse to send that text (the `→` isn't allowed in a header), so **Create account** and **Sign in** said “We couldn’t reach the server”. **Continue with Google** started correctly (`redirect_to=https://durar.space/word/bahr?durar=oauth`, PKCE), but its last step used the same key. You replaced it with the publishable key, live since 20:31 UTC: the site's JavaScript now carries an `sb_publishable_…` key, and the placeholder text is gone. Not re-run from here, at your request. |
| 4 | Save → My Pearls → remove → Delete account | Yours to test, with 3. Not run from here, at your request. |
| 5 | Subscribe → confirm → unsubscribe | — Not on production yet, as planned: `EMAIL_SIGNUP` is off, so there's no subscribe link. DNS shows SES isn't set up yet (no DMARC record, no `mail.durar.space`). Separately, the `/api` functions answered 500 until 21:26 UTC; they start now (see [Vercel follow-up](#vercel-follow-up-2026-09-25-evening)). |
| 6 | Privacy contact | ✓ “Write to hello@durar.space …”, with a mailto link. Region: “EU (Frankfurt, Germany)”. Mail for durar.space goes to Namecheap's forwarding; send `hello@` one test email to make sure it's forwarded. |
| 7 | Share on desktop | ✓ **WhatsApp:** `https://wa.me/?text=…` with only `text`, the exact text and link, a new tab, `noopener noreferrer`. **Copy link:** the clipboard holds `https://durar.space/word/bahr`, “Link copied” shows, focus returns to Share. **Download image:** `durar-bahr.png`, 1080×1920, description `بَحْر (baḥr): sea`, signature present and pixel-identical to the test snapshot. The text-only view has the same menu and download. No console errors. |
| 8 | Lighthouse | Desktop 64–66 · mobile 39–68 (median 65 both) · Accessibility, Best practices, SEO 100 on every run. Details under “Quality bar”. |

Also checked: `/` opens on today's pearl (`mirah`), and a phone-sized load (Pixel 7) shows the scene and
one Share icon on the card. The vercel.app host no longer redirects `/api/…`, so a scheduler that still
calls it keeps working. DOMAIN-DAY Part 7, step 2 points it at durar.space anyway.

### Vercel follow-up (2026-09-25, evening)

Checked from 21:10 UTC through the Vercel API (project `arabic-lang-project`) and with plain requests.
Variable names only: no values were read.

**The `/api` functions: 500 until 21:26 UTC, fixed.** At 21:10, `GET /api/cron/daily` returned 500
(`{"error":"server_error"}`) on durar.space and on the vercel.app host, and the function log said
`SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set`. Each function builds its configuration before it
looks at the request (`productionDeps` in `server/deps.ts`), and stops with a 500 if either of these is
missing:
1. the Supabase URL and service key: `SUPABASE_URL` (or `VITE_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`);
2. `EMAIL_TOKEN_SECRET`, at least 32 characters.

Production had four variables: `VITE_CONTACT_EMAIL`, `VITE_DATA_REGION`, `VITE_SUPABASE_ANON_KEY` and
`VITE_SUPABASE_URL`. You then added `SUPABASE_SERVICE_ROLE_KEY` (21:24 UTC) and `EMAIL_TOKEN_SECRET`
(21:25), both as Sensitive and for Production only, and redeployed (live at 21:26). Checked at 21:27:
- `GET /api/cron/daily` → **401** `{"error":"unauthorized"}` on durar.space and on the vercel.app host, and also with a wrong secret.
- `POST /api/confirm` and `POST /api/unsubscribe` with an empty body → 400 `{"status":"invalid"}`. Both stop at the missing token, before the database.

Against the table in [`EMAIL-SETUP.md`](EMAIL-SETUP.md) §2, as of 21:27:

| Variable | In Production | Without it |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | yes, since 21:24 | **every function answers 500** (the error above) |
| `EMAIL_TOKEN_SECRET` | yes, since 21:25 | **every function answers 500**: the next error once the key is in |
| `CRON_SECRET` | no | `/api/cron/daily` refuses every call with 401, so the scheduler can't start the daily email |
| `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY` | no | nothing is sent (logged as “SES keys missing”) |
| `EMAIL_FROM` | no | the sender would be `Durar <no-reply@example.com>`, which SES refuses |
| `EMAIL_SANDBOX_TO` | no | sandbox mode (the default) has nobody to send to, test sends included |
| `SUPABASE_URL` | no | fine: `VITE_SUPABASE_URL` is used instead |
| `SES_REGION` | no | fine: defaults to `eu-central-1` |
| `EMAIL_MODE` | no | fine: defaults to `sandbox` |
| `EMAIL_SUBJECT_STYLE` | no | fine: **b** is the default, so leave it out |

The 401 shows the functions start. It doesn't prove the service key is right, because the secret is
checked first. Once `CRON_SECRET` is in, `?dry=1` proves it: it uses the database (it counts the
recipients and runs the usual cleanup) and sends nothing:
`curl -H "Authorization: Bearer <CRON_SECRET>" "https://durar.space/api/cron/daily?dry=1"`.

**Production branch.** All ten production deployments since the import on 2026-09-23 came from
`claude/new-session-id31u5`, including the one live now. `main` has never been deployed. Vercel →
Settings → Git still names `claude/new-session-id31u5` as the production branch (set in Phase 0.2, see
[`ACCOUNTS-SETUP.md`](ACCOUNTS-SETUP.md)). Today that branch is `main` plus one report commit (`acefcd8`),
so durar.space runs the same code as `main`. But merging a phase into `main` won't reach durar.space.

**Preview deployments.** `VITE_SUPABASE_URL`, `VITE_CONTACT_EMAIL` and `VITE_DATA_REGION` are ticked for
Production and Development, not Preview. Only `VITE_SUPABASE_ANON_KEY` has Preview. So previews have no
sign-in (the site needs both the URL and the key), no Privacy contact, and no Supabase URL for their
`/api` functions.

## Follow-up: sharper card text

You reported that the 3D card's text was blurred, and barely readable on a phone. Three causes, all fixed:
- **Phone resolution:** phones rendered the scene at 1.5× at most, and dropped to 1× when the frame rate dipped. On a 3× screen that's a third of full sharpness. Now every device renders at up to 2×, and the automatic slowdown never goes below 1.5×. Phones still use fewer particles and cards, as before.
- **Depth-of-field blur:** the blur meant for background cards still applied a little to the focused card while it settled. The focused card now samples a slightly *sharper* texture level instead.
- **Water ripple:** the caustic refraction no longer moves the focused card's text. It still ripples the cards behind.

All 79 Playwright tests still pass.

## Files

- `src/share/text.ts`: the share text, canonical URL and WhatsApp link builders.
- `src/share/geometry.ts`, `layout.ts`, `image.ts`: the story image (safe area, auto-fit, drawing, signature, PNG description).
- `src/share/share.ts`: prepare/cache, the phone share sheet and its fallbacks, copy link, download.
- `src/ui/ShareButton.tsx` (main bundle, small), `ShareMenu.tsx` (lazy), `CardActions.tsx` (Share + save).
- `shared/site.ts`: the canonical origin, shared by the build and the tests.
- `vercel.json`: the host redirects.
- Tests: `tests/share.spec.ts`, `tests/share-mobile.spec.ts`, `tests/share-helpers.ts`, `tests/unit/share.test.ts`, `tests/unit/storyLayout.test.ts`. The snapshots under `tests/*-snapshots/` are test references (about 0.3 MB), not site images.

## Needs your input

1. **`CRON_SECRET`** (for the daily email): Vercel → **Settings → Environment Variables** → **Add** → `CRON_SECRET` = the output of `openssl rand -base64 36`, for Production → **Redeploy**. Keep the value for the scheduler (EMAIL-SETUP §4). Until then `/api/cron/daily` refuses every call with 401, the scheduler's included. Then run the `?dry=1` command under “Vercel follow-up” to prove the service key works. The SES keys, `EMAIL_FROM` and `EMAIL_SANDBOX_TO` can wait for the email test (DOMAIN-DAY Part 7).
2. **Production branch:** Vercel → **Settings → Git → Production Branch**: change `claude/new-session-id31u5` to `main`, so that merging a phase into `main` updates durar.space, as these reports assume. The site doesn't change until the next deployment from `main`.
3. **Previews (optional):** previews have no `VITE_SUPABASE_URL`, `VITE_CONTACT_EMAIL`, `VITE_DATA_REGION`, `SUPABASE_SERVICE_ROLE_KEY` or `EMAIL_TOKEN_SECRET`. Add **Preview** to them if you want sign-in, the Privacy contact and working `/api` functions on preview deployments.
4. **Real-phone test:** on an iPhone and an Android phone, open a word, tap Share, and share to **Instagram Stories** and **WhatsApp**. Check that the signature (دُرَر durar.space, bottom-right of the card) is visible and nothing is covered by Instagram's bars. If Instagram doesn't appear in the iPhone's share sheet, tell me. iOS sometimes hides it when a link is shared along with the image, and the fix is to send the image alone to image apps.
5. **Domain day:** the remaining steps in [`DOMAIN-DAY.md`](DOMAIN-DAY.md).
6. **Inbox test:** the table above.

Done since the first live check:
- ~~**The Supabase key**~~: `VITE_SUPABASE_ANON_KEY` holds the publishable key, live since 20:31 UTC. Sign-in is yours to test (live check 3–4).
- ~~**`www.durar.space`**~~: added to the project at 21:09 UTC as a 308 redirect to `durar.space`. Its certificate was live by 21:12.
- ~~**`arabic-lang-project.vercel.app`**~~: serves Production again, so `vercel.json` redirects its pages with a 308 and leaves `/api/` alone.
- ~~**Server variables**~~: `SUPABASE_SERVICE_ROLE_KEY` and `EMAIL_TOKEN_SECRET` are in Production, and the redeploy at 21:26 UTC fixed the 500s: `/api/cron/daily` answers 401.

## Still open

- Native-speaker review of the 140 words, and a real-device performance check.
- Backlog from the checklist: 0.5 mastery, 0.6 content pipeline (and moving the static card images to file storage), 0.7 optional anonymous share count.
