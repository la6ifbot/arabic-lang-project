# Phase 0.4 — Sharing: report

Live: https://durar.space (production deploys from `main`). Checked live on 2026-09-25: production runs
this phase, including the sharper card text.
Preview with browser-only demo accounts: https://claude.ai/artifact/A71zLZPK1zRW3nWbferAHZ

Legend: **[x]** done and verified · **[~]** built, waiting on the owner or on something I can't reach
from here · **[ ]** not done

> **Live check, 2026-09-25** ([results](#live-check-results-2026-09-25)). Sharing, the SEO tags, the
> sitemap and the Privacy contact all work on durar.space, and Lighthouse ran live. Three things need
> you, all in Vercel: the Supabase key (sign-in is broken on the live site), `www.durar.space` (no
> certificate) and the vercel.app redirect (302 instead of 308). See “Needs your input”.

## Checklist

### A. Carry-over from 0.3 and domain day
- [~] **durar.space everywhere.** `SITE_URL` defaults to `https://durar.space` (then Vercel's production domain), so canonicals, `og:url`, `og:image`, the sitemap, `robots.txt`, email links and share links all use it. Checked on a simulated production build. **New:** `vercel.json` permanently redirects (308) `www.durar.space` and `arabic-lang-project.vercel.app` to `durar.space`, keeping the path. `/api/…` is left alone so an older scheduler URL keeps working. Preview URLs aren't redirected. **Live:** the tags, sitemap and `robots.txt` are right. The two host redirects aren't yet (live check item 1).
- [x] **Owner steps**, click by click: [`DOMAIN-DAY.md`](DOMAIN-DAY.md). Covers Vercel domains and `SITE_URL`, Supabase Site URL and redirects, Google sign-in (origins and the authorized domain `durar.space`), SES domain verification (DKIM, SPF, DMARC and custom MAIL FROM, written for Namecheap's Host field), the production-access request text, Supabase SMTP via SES, turning **Confirm email** back on, and going live. You said you'd do these later.
- [x] **Subject style b** is the default: `Pearl of the Day: سَرَاب (sarāb)`. You can delete `EMAIL_SUBJECT_STYLE`.
- [~] **`EMAIL_MODE=live` and `EMAIL_SIGNUP=on`:** both stay off until SES production access is approved and a test lands in the inbox (DOMAIN-DAY Part 7). No code change is needed.
- [~] **Live verification:** run on 2026-09-25 (results under “Live check”). Share, the SEO tags and Privacy pass. Sign-up, Google, save and delete account fail on the live site, because Vercel holds placeholder text instead of the Supabase key. Subscribe waits for domain day.
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
| 1 | Host redirects | ✗ **`www.durar.space`:** there's no certificate for `www`. Vercel presents the `durar.space` certificate, so browsers show a security warning instead of redirecting. DNS is already right (`www` → `cname.vercel-dns.com`, no CAA limits). **`arabic-lang-project.vercel.app`:** lands on `https://durar.space/word/bahr`, keeping the path and query, but with a **302** (temporary), not 308, and `/api/…` is redirected too. That's a redirect set on Vercel's Domains page, which runs before `vercel.json`. |
| 2 | Tags and sitemap | ✓ `canonical`, `og:url`, `og:image`, `twitter:image` and the JSON-LD `url` are all on `https://durar.space`. `/sitemap.xml`: 142 addresses, all `https://durar.space/…`, no `/library`. `robots.txt` points at it. The `og:image` loads (1200×630 PNG). |
| 3 | Sign-up, Google | ✗ **Broken for every visitor.** Vercel's `VITE_SUPABASE_ANON_KEY` holds the text “the anon or publishable key from Supabase → Project Settings → API Keys” instead of the key. Browsers refuse to send that text (the `→` isn't allowed in a header), so **Create account** and **Sign in** say “We couldn’t reach the server”. **Continue with Google** starts correctly (`redirect_to=https://durar.space/word/bahr?durar=oauth`, PKCE), but its last step uses the same key, so it fails the same way. |
| 4 | Save → My Pearls → remove → Delete account | ✗ Needs sign-in (3). |
| 5 | Subscribe → confirm → unsubscribe | — Not on production yet, as planned: `EMAIL_SIGNUP` is off, so there's no subscribe link. DNS shows SES isn't set up yet (no DMARC record, no `mail.durar.space`). |
| 6 | Privacy contact | ✓ “Write to hello@durar.space …”, with a mailto link. Region: “EU (Frankfurt, Germany)”. Mail for durar.space goes to Namecheap's forwarding; send `hello@` one test email to make sure it's forwarded. |
| 7 | Share on desktop | ✓ **WhatsApp:** `https://wa.me/?text=…` with only `text`, the exact text and link, a new tab, `noopener noreferrer`. **Copy link:** the clipboard holds `https://durar.space/word/bahr`, “Link copied” shows, focus returns to Share. **Download image:** `durar-bahr.png`, 1080×1920, description `بَحْر (baḥr): sea`, signature present and pixel-identical to the test snapshot. The text-only view has the same menu and download. No console errors. |
| 8 | Lighthouse | Desktop 64–66 · mobile 39–68 (median 65 both) · Accessibility, Best practices, SEO 100 on every run. Details under “Quality bar”. |

Also checked: `/` opens on today's pearl (`mirah`), and a phone-sized load (Pixel 7) shows the scene and
one Share icon on the card. If the daily-email scheduler still calls `arabic-lang-project.vercel.app`,
that 302 stops it: DOMAIN-DAY Part 7, step 2 points it at durar.space.

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

1. **The Supabase key (sign-in is broken on the live site).** Vercel → `arabic-lang-project` → **Settings → Environment Variables** → `VITE_SUPABASE_ANON_KEY`. It holds the words “the anon or publishable key from Supabase → Project Settings → API Keys”. Replace them with the key itself: Supabase → **Project Settings → API Keys** → the **anon** key (starts with `eyJ`) or the **publishable** key (starts with `sb_publishable_`). Keep **Production** and **Preview** ticked → **Save** → **Deployments** → latest Production → **⋯ → Redeploy**. Then live check items 3–4 can run.
2. **`www.durar.space`:** Vercel → **Settings → Domains**. If `www.durar.space` isn't listed: **Add** → `www.durar.space` → **Redirect to `durar.space`** (308). If it's listed with a warning, open it and follow Vercel's prompt. DNS is already right, so the certificate follows within minutes.
3. **`arabic-lang-project.vercel.app`:** same page → **Edit** on it. It redirects to durar.space with a temporary 302, and because that runs before `vercel.json`, `/api/…` is redirected too. Set it back to serving **Production** (no redirect): `vercel.json` then sends pages to durar.space with a permanent 308 and leaves `/api/` alone. (If you keep the dashboard redirect, pick **308**, and make sure the scheduler points at durar.space: DOMAIN-DAY Part 7, step 2.)
4. **Real-phone test:** on an iPhone and an Android phone, open a word, tap Share, and share to **Instagram Stories** and **WhatsApp**. Check that the signature (دُرَر durar.space, bottom-right of the card) is visible and nothing is covered by Instagram's bars. If Instagram doesn't appear in the iPhone's share sheet, tell me. iOS sometimes hides it when a link is shared along with the image, and the fix is to send the image alone to image apps.
5. **Domain day:** the remaining steps in [`DOMAIN-DAY.md`](DOMAIN-DAY.md).
6. **Inbox test:** the table above.

## Still open

- Native-speaker review of the 140 words, and a real-device performance check.
- Backlog from the checklist: 0.5 mastery, 0.6 content pipeline (and moving the static card images to file storage), 0.7 optional anonymous share count.
