# Durar · دُرَر

**Arabic words, like pearls.** An immersive, single-screen 3D space for discovering beautiful Arabic
vocabulary. Word cards drift like pearls in deep water. You swipe through them, or search for one
and watch it rise out of the depths.

> Status: **Phase 0.1 — Core Experience (MVP)**. See [`docs/PHASE-0.1.md`](docs/PHASE-0.1.md) for the
> checklist report against the development plan.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # type-check, bundle, prerender /word/<slug> pages → dist/
npm run preview        # serve dist/ at http://localhost:4173 (clean URLs like production)
npm run validate:data  # schema check for src/data/words.json
npm run test:e2e       # Playwright (builds are served via `npm run preview`)
```

If Playwright can't download browsers in your environment, point it at an existing Chromium:
`PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

## How to use it

| Action | Mouse / trackpad | Touch | Keyboard |
| --- | --- | --- | --- |
| **I know this** (card sinks into the deep) | drag right · two-finger swipe right | swipe right | `→` |
| **Still learning** (card drifts aside, comes back soon) | drag left · two-finger swipe left | swipe left | `←` |
| Search | click the search box | tap it | `/` |
| Bring a background pearl forward | click it | tap it | — |

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
  ui/                    2D chrome: search combobox, swipe controls, live region, text-only view
scripts/prerender.mjs    post-build: static HTML + OG/Twitter/JSON-LD for every word
tests/                   Playwright e2e (desktop, mobile touch, no-WebGL)
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

- **Markazi Text** (cards, 400/600): an elegant contemporary Naskh. Its diacritics sit close to
  their letters even at 250 px. Amiri placed marks far above short letters like د and ر, so a
  vowelled headword looked broken.
- **Aref Ruqaa** (wordmark only): calligraphic Ruqʿa, for the “signature” feel.
- **Cormorant Garamond** (English meanings/translations) and **IBM Plex Sans Arabic** (UI chrome,
  covers both scripts).

All fonts are self-hosted via Fontsource (SIL Open Font License), with no third-party font CDN.

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
detected automatically.

Per-word social preview **images** arrive with the card-export work in Phase 0.4. Until then, link
previews show the title and description only.
