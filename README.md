# Durar · دُرَر

**Arabic words, like pearls.** An immersive, single-screen 3D space for discovering beautiful Arabic
vocabulary. Word cards drift like pearls in deep water. You swipe through them, or search for one
and watch it rise out of the depths.

> Status: **Phase 0.4 — Sharing**. Reports: [0.1](docs/PHASE-0.1.md), [0.2](docs/PHASE-0.2.md),
> [0.3](docs/PHASE-0.3.md), [0.4](docs/PHASE-0.4.md). Setup: [accounts](docs/ACCOUNTS-SETUP.md), [daily email](docs/EMAIL-SETUP.md), [domain day](docs/DOMAIN-DAY.md).

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # type-check, bundle, prerender /word/<slug> pages → dist/
npm run preview        # serve dist/ at http://localhost:4173 (clean URLs like production)
npm run validate:data  # schema check for src/data/words.json
npm run test:e2e       # Playwright (builds are served via `npm run preview`)
npm run test:db        # database tests (RLS, subscriptions); needs DATABASE_URL (PostgreSQL)
npm run test:unit      # schedule, email rendering, server handlers (handlers need DATABASE_URL)
npm run cards          # re-render card images for new/changed words (needs Chromium)
npm run email:render   # write today's emails to dist-email/ for a look
npm run check:functions  # compile api/ like Vercel and load it in plain Node
```

Accounts need a Supabase project (see [`docs/ACCOUNTS-SETUP.md`](docs/ACCOUNTS-SETUP.md)). Copy
`.env.example` to `.env.local` and fill in the values. Without them the site runs exactly as
before, just without sign-in. To try accounts with no backend at all, run
`VITE_BACKEND=mock npm run dev`: a browser-only demo that needs no email.

If Playwright can't download browsers in your environment, point it at an existing Chromium:
`PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

## How to use it

| Action | Mouse / trackpad | Touch | Keyboard |
| --- | --- | --- | --- |
| **I know this** (card sinks into the deep) | drag right · two-finger swipe right | swipe right | `→` |
| **Still learning** (card drifts aside, comes back soon) | drag left · two-finger swipe left | swipe left | `←` |
| Search | click the search box | tap it | `/` |
| Bring a background pearl forward | click it | tap it | — |
| Save to My Pearls | the pearl on the card's corner | tap it | `S` |
| Share | the share icon beside it: WhatsApp, Copy link, Download image | tap it: your phone's share sheet, with the image | Tab to it, `Enter` |

A **Text-only view** toggle (bottom-left) switches to a calm HTML version with the same data and
controls. It's also what you see automatically if WebGL isn't available.

## Architecture

```
src/
  data/words.json        curated word set (140 words) — the single source of truth
  lib/words.ts           data access + search (diacritic/hamza-insensitive Arabic, translit, English)
  lib/router.ts          “/” and “/word/<slug>” routing; URL + <title> follow the focused card
  lib/cardTexture.ts     canvas renderer for card text (browser-shaped RTL Arabic)
  lib/fonts.ts           self-hosted webfonts, explicitly loaded before canvas drawing
  state/store.ts         Zustand store: rotation queue, swipes, search surfacing
  scene/                 react-three-fiber scene (lazy-loaded chunk)
    Experience.tsx       <Canvas> + scene graph
    PearlCard.tsx        one card: choreography (focus, sink, drift, rise) via critically-damped springs
    cardMaterial.ts      card shader: nacre body, iridescent rim, caustics, mip-bias depth-of-field, water fog
    Backdrop/GodRays/Particles/Bubbles
    useSwipeInput.ts     one gesture model for mouse, touch, trackpad and arrow keys
  ui/                    2D chrome: search, swipe controls, live regions, text-only view,
                         sign-in dialog, account menu, save control
  account/               accounts: Supabase client (lazy chunk), browser-only mock, store
                         (optimistic saves, pending save across sign-in), friendly errors
  pages/                 /library (My Pearls) and /privacy, light CSS-only pages
  share/                 sharing (lazy chunk): share text + links, the 9:16 story image, share sheet
shared/                  code used by both site and server (Pearl of the Day schedule, flags)
api/                     Vercel functions: subscribe, confirm, unsubscribe, cron/daily
server/                  their logic: handlers, SQL-function store, email templates, SES adapter
public/cards/            card images (social previews + email), rendered by scripts/cards.mjs
supabase/migrations/     versioned SQL: saved_pearls, subscribers, daily_sends, RLS, functions
supabase/setup/          one-off owner SQL (pg_cron schedule for the daily email)
scripts/prerender.mjs    post-build: static HTML + OG/Twitter/JSON-LD for every word; noindex /library
aleppo.html, src/aleppo/ the 3D Citadel of Aleppo at /aleppo (plain three.js, its own build: vite.aleppo.config.ts)
tests/                   Playwright e2e (desktop, mobile touch, no-WebGL, accounts, axe a11y)
tests/db/                node:test Row Level Security suite against real PostgreSQL
```

**Design decisions:**

- **Text as texture.** Each card's text is drawn on a canvas and applied as a texture, so it sits
  inside the scene's lighting, fog, caustics and blur. The browser's text engine handles Arabic
  shaping (joined letterforms, diacritics, `direction: rtl`). An `aria-live` HTML copy of the
  focused card sits alongside it for screen readers and crawlers.
- **Cheap depth-of-field.** Instead of a full-screen DoF pass, unfocused cards sample blurrier mip
  levels of their own texture (a texture LOD bias) and mix toward the water colour behind them. It
  looks similar at a fraction of the GPU cost.
- **Weighty motion.** Every card eases toward a target pose with a critically-damped spring
  (SmoothDamp). Motion starts and stops slowly, like something moving through water, and changes
  course smoothly if you swipe again partway through.
- **Performance.** The 3D code lives in a lazy chunk. The static boot screen paints before any JS
  runs. Background cards mount one at a time. Pixel ratio drops automatically if frame rate
  stays under ~42 fps. Phones get fewer particles and cards. `prefers-reduced-motion` calms the
  camera, particles, light rays and bubbles.

### Typography

Evaluated **Amiri, Noto Naskh Arabic, Scheherazade New, Markazi Text and Aref Ruqaa** at display
sizes with full diacritics:

- **Noto Naskh Arabic** (cards, headwords and examples, 400/600): a formal print Naskh. It stacks
  shadda with its vowel correctly (رَحَّالَة, مَشْرَبِيَّة). Markazi Text, the first choice, drew
  shadda + fatha as a squashed, misplaced mark, and Amiri placed marks far above short letters.
- **Aref Ruqaa** (wordmark only): calligraphic Ruqʿa, for the “signature” feel.
- **Cormorant Garamond** (English meanings/translations) and **IBM Plex Sans Arabic** (UI chrome,
  covers both scripts).

All fonts are self-hosted via Fontsource (SIL Open Font License), with no third-party font CDN.

### Accounts

- The words stay static (`words.json` plus prerendered pages). The database stores only
  *which* word slugs each user saved, so SEO and load time are unaffected.
- The browser talks to Supabase directly with the public anon key. **Row Level Security** is the
  security boundary: users can read, add and remove only their own rows; nobody can update rows;
  signed-out requests get nothing. `tests/db/rls.test.mjs` proves this against real PostgreSQL
  (user A cannot read or write user B's pearls) and runs in CI.
- `delete_my_account()` is a `security definer` function, so people can delete their own
  account without a server.
- The Supabase client is a lazy chunk loaded after the scene is up (or immediately when an auth
  redirect lands), so it never delays first paint.

### Pearl of the Day

- `shared/pearlOfTheDay.ts` maps each Europe/Amsterdam calendar day to a word. Every word appears
  once per cycle, and words added later (with an `added` date) join the next cycle, so past days
  never change. The site (`/` opens on today's pearl) and the email sender both use it.
- Card images are rendered with headless Chromium (real Arabic shaping) and committed under
  `public/cards/`. A hash manifest means `npm run cards` only redraws what changed. The build fails if
  an image is stale.
- The email runs on Vercel functions + Supabase + Amazon SES: double opt-in, one-click unsubscribe,
  no tracking, one send per subscriber per day (enforced by a primary key), and sandbox mode until the
  domain exists. Details: [`docs/EMAIL-SETUP.md`](docs/EMAIL-SETUP.md).

### Sharing

- One Share icon beside the save pearl, on the focused card (3D and text-only). Phones open the
  system share sheet with a 1080×1920 story image, the text and the link. Desktop gets a small menu:
  WhatsApp, Copy link, Download image. Sharing needs no account, and nothing is counted or tagged.
- The story image is drawn in the browser (`src/share/image.ts`) with the site's own fonts, in the
  same look as the card images. Every exported image goes through `renderStory`, which always draws
  the دُرَر · durar.space signature inside Instagram's safe area. `layout.ts` shrinks and wraps
  long words until everything fits.
- iOS only opens the share sheet straight from a tap, so phones draw the focused card's image while
  idle. The tap then shares at once.
- Links are always the canonical `https://durar.space/word/<slug>` (from `SITE_URL`). Text:
  `سَرَاب (sarāb) — mirage · a pearl from Durar`, or a “Today's pearl” version for the Pearl of the Day.

## The Citadel of Aleppo (`/aleppo`)

A standalone 3D model of the Citadel of Aleppo (قلعة حلب) in plain three.js, with every part named in
Arabic. It isn't linked from the sea yet. Open `/aleppo` (`npm run dev`, then
http://localhost:5173/aleppo), or link straight to a place: `/aleppo#bridge`.

- **Built from measurements, not a model file.** The mound is an ellipse 285 × 160 m on top, 50 m
  above the city, with a concave stone glacis down to a 20 m moat floor. On it: the curtain wall and
  its towers, the entrance block with the Throne Hall, the bridge on seven arches (they shrink as the
  glacis rises) and the lower tower, the Great Mosque and its 21 m minaret, the barracks, the theatre,
  Abraham's shrine, the palace ruins, the north tower, and the old city around it. Everything is
  generated in `src/aleppo/` from the plan in `layout.ts`.
- **Stone.** Ashlar textures drawn on a canvas at load (walls and glacis, each with a bump map). UVs are
  in metres, so courses line up at the same heights everywhere. A shader patch adds eroded earth patches to the
  glacis and the warm floodlighting at night.
- **Time of day.** Four moments named with Durar's words: فَجْر dawn, ضُحًى morning, شَفَق sunset,
  لَيْل night (stars, a crescent moon, floodlights, lit windows and city lights).
- **Light on the device.** It renders only while something moves, redraws the shadow map only when the
  light moves, drops pixel ratio if frame rate stays low, and phones get a smaller city. Reduced motion
  means no auto-orbit and instant camera moves. Without WebGL the page describes the citadel in words.
- **Its own build.** `vite.aleppo.config.ts` runs after the main build and writes into `dist/`, so the
  sea's chunks and first paint are unchanged. Tests: `tests/aleppo.spec.ts`, `tests/aleppo-nowebgl.spec.ts`.

## Word data

`src/data/words.json` holds 140 hand-picked words: the sea, light, sky, longing, virtue, desert,
scent, language and poetry. Each has a fully vowelled headword, a transliteration, meanings and 1–3
example sentences. A few are attributed classical lines (Hafez Ibrahim, al-Mutanabbi, Imruʾ al-Qays,
all public domain). Examples were written for Durar. No third-party lexicon was imported, so no
licence is involved yet (that's Phase 0.6).

```ts
interface Word {
  slug: string;            // URL id → /word/<slug>
  ar: string;              // headword with diacritics
  translit: string;
  meanings: string[];
  examples: { ar: string; en: string; source?: string }[]; // 1–3
  root?: string;           // reserved: root-family feature
  tags?: string[];
  audio?: string;          // reserved: pronunciation audio
  added?: string;          // ISO date, required for words added after launch (Pearl of the Day cycles)
}
```

Run `npm run validate:data` after editing.

## Deploying

The build output (`dist/`) is fully static:

- **Vercel**: import the repo. `vercel.json` sets the build and SPA fallback. Static word pages win
  over the rewrite.
- **Netlify**: import the repo. `netlify.toml` does the same.

Set `SITE_URL` (e.g. `https://durar.example`) at build time to emit absolute canonical/`og:url`
tags, `sitemap.xml` and a `robots.txt` sitemap entry. On Vercel and Netlify the production URL is
detected automatically. `/library` is always `noindex` and left out of the sitemap.

For accounts, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production *and* Preview
(full walkthrough, including Google sign-in and email delivery: [`docs/ACCOUNTS-SETUP.md`](docs/ACCOUNTS-SETUP.md)).

Every word page carries its card image (`og:image`), so link previews in WhatsApp, Telegram and
iMessage show the card. `vercel.json` permanently redirects `www.durar.space` and
`arabic-lang-project.vercel.app` to `durar.space` (except `/api/`).
