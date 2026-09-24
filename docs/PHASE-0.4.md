# Phase 0.4 — Sharing: report

Live: https://durar.space (production deploys from `main`; this work is on `claude/new-session-id31u5`).
Preview with browser-only demo accounts: https://claude.ai/artifact/A71zLZPK1zRW3nWbferAHZ

Legend: **[x]** done and verified · **[~]** built, waiting on the owner or on something I can't reach
from here · **[ ]** not done

> **Two things are still out of reach from this environment.** (1) The network policy still refuses
> `durar.space`, `www.durar.space` and `arabic-lang-project.vercel.app` (HTTP 403 from the proxy).
> Allowed-domain changes may only apply to a **new** session. So the live checks and live Lighthouse
> are still to do. (2) GitHub lists only `claude/new-session-id31u5`: there's no `main` branch yet,
> so this can't be merged to `main` from here. Both are under “Needs your input”.

## Checklist

### A. Carry-over from 0.3 and domain day
- [~] **durar.space everywhere.** `SITE_URL` defaults to `https://durar.space` (then Vercel's production domain), so canonicals, `og:url`, `og:image`, the sitemap, `robots.txt`, email links and share links all use it. Checked on a simulated production build. **New:** `vercel.json` permanently redirects (308) `www.durar.space` and `arabic-lang-project.vercel.app` to `durar.space`, keeping the path. `/api/…` is left alone so an older scheduler URL keeps working. Preview URLs aren't redirected. Waiting on a live check.
- [x] **Owner steps**, click by click: [`DOMAIN-DAY.md`](DOMAIN-DAY.md). Covers Vercel domains and `SITE_URL`, Supabase Site URL and redirects, Google sign-in (origins and the authorized domain `durar.space`), SES domain verification (DKIM, SPF, DMARC and custom MAIL FROM, written for Namecheap's Host field), the production-access request text, Supabase SMTP via SES, turning **Confirm email** back on, and going live. You said you'd do these later.
- [x] **Subject style b** is the default: `Pearl of the Day: سَرَاب (sarāb)`. You can delete `EMAIL_SUBJECT_STYLE`.
- [~] **`EMAIL_MODE=live` and `EMAIL_SIGNUP=on`:** both stay off until SES production access is approved and a test lands in the inbox (DOMAIN-DAY Part 7). No code change is needed.
- [~] **Live verification** (sign-up with confirmation, Google, save, Library, delete account, subscribe → confirm → unsubscribe, Privacy contact): blocked by the network policy. The same flows pass in Playwright against the production build. The list below is ready for you or for my next session.
- [~] **Live Lighthouse:** blocked for the same reason. The local production-build numbers are below.
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

The same as in 0.3 (68 / 50). The live run on durar.space is still to do.

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

## Files

- `src/share/text.ts`: the share text, canonical URL and WhatsApp link builders.
- `src/share/geometry.ts`, `layout.ts`, `image.ts`: the story image (safe area, auto-fit, drawing, signature, PNG description).
- `src/share/share.ts`: prepare/cache, the phone share sheet and its fallbacks, copy link, download.
- `src/ui/ShareButton.tsx` (main bundle, small), `ShareMenu.tsx` (lazy), `CardActions.tsx` (Share + save).
- `shared/site.ts`: the canonical origin, shared by the build and the tests.
- `vercel.json`: the host redirects.
- Tests: `tests/share.spec.ts`, `tests/share-mobile.spec.ts`, `tests/share-helpers.ts`, `tests/unit/share.test.ts`, `tests/unit/storyLayout.test.ts`. The snapshots under `tests/*-snapshots/` are test references (about 0.3 MB), not site images.

## Needs your input

1. **`main` branch:** GitHub shows only `claude/new-session-id31u5`. Please create `main` from it (GitHub → Branches → New branch → source `claude/new-session-id31u5`) or merge it into your `main`, so Vercel production (durar.space) gets this phase. Or allow this session to push `main` and I'll do it.
2. **Network access:** allow `durar.space`, `www.durar.space` and `arabic-lang-project.vercel.app` in this environment and **start a new session**. The current one still gets 403. Then I'll run the live check and live Lighthouse.
3. **Real-phone test:** on an iPhone and an Android phone, open a word, tap Share, and share to **Instagram Stories** and **WhatsApp**. Check that the signature (دُرَر durar.space, bottom-right of the card) is visible and nothing is covered by Instagram's bars. If Instagram doesn't appear in the iPhone's share sheet, tell me. iOS sometimes hides it when a link is shared along with the image, and the fix is to send the image alone to image apps.
4. **Domain day:** the remaining steps in [`DOMAIN-DAY.md`](DOMAIN-DAY.md).
5. **Inbox test:** the table above.

## Still open

- Native-speaker review of the 140 words, and a real-device performance check.
- Backlog from the checklist: 0.5 mastery, 0.6 content pipeline (and moving the static card images to file storage), 0.7 optional anonymous share count.
