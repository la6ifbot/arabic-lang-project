# Phase 0.1 — Core Experience (MVP): report

Preview: https://claude.ai/artifact/A71zLZPK1zRW3nWbferAHZ (private single-file build: `npm run build:preview-artifact`).
A permanent URL needs a Vercel or Netlify project connected to this repo. Config for both is included.

## Checklist

**Setup & scene**
- [x] Project initialised: React 19 + Vite 7 + TypeScript (strict)
- [x] Three.js scene via react-three-fiber: camera rig with slow drift and pointer parallax, water-gradient backdrop lit from above
- [x] Reusable `PearlCard` (`src/scene/PearlCard.tsx`, `cardMaterial.ts`): curved card mesh, custom shader, text drawn to a canvas texture
- [x] Drifting particulate: slow upward “marine snow” with sway (`Particles.tsx`)
- [x] God rays: slanted additive light shafts that sweep and breathe (`GodRays.tsx`)
- [x] Depth of field: unfocused cards sample blurred mip levels and dissolve into the water colour
- [x] Caustic ripple distortion and caustic light on unfocused cards
- [x] Arabic webfont: **Markazi Text**, chosen after comparing Amiri, Noto Naskh, Scheherazade New and Aref Ruqaa (see README)

**Content**
- [x] Word schema finalised (`src/types.ts`), with room for root, tags and audio
- [x] 140 curated words in `src/data/words.json`, validated by `npm run validate:data`

**Interaction**
- [x] Swipe: mouse drag, trackpad two-finger swipe (with momentum-tail suppression), ← / → keys
- [x] Slow, weighty focus transitions using critically-damped springs that stay smooth when interrupted
- [x] Corner search with live autocomplete across Arabic (diacritic- and hamza-insensitive), transliteration and English; full ARIA combobox; `/` shortcut
- [x] Search-to-surface: the chosen card waits in the depths, catches a shaft of light, rises with a bubble wake and glows as it arrives
- [x] RTL correctness: browser-shaped Arabic on canvas, `lang="ar" dir="rtl"` on every Arabic node in the DOM, `dir="auto"` search input

**Non-functional**
- [x] Single full-viewport, no-scroll layout (Playwright asserts zero overflow on desktop and phone)
- [~] Performance pass: see below. Automated only; still needs a check on a real mid-range laptop and phone
- [x] Graceful fallback: no WebGL, a failed context or a lost context all switch to the text-only view with a message
- [x] Touch swipe on mobile
- [x] Live preview URL (artifact). A permanent host is waiting on you (see “Needs your input”)

## Cross-cutting quality bar

- **Accessibility**: keyboard-only use works (arrows, `/`, Tab to the labelled controls and search). An `aria-live` region mirrors the focused card, and a text-only view is available as an alternative path. Lighthouse Accessibility: **100**.
- **SEO**: `/word/<slug>` routes. `scripts/prerender.mjs` writes 140 static pages with a unique title, description, OG/Twitter tags, schema.org `DefinedTerm` JSON-LD and the card's text. The home page links every word, and `sitemap.xml` is generated when `SITE_URL` is set. Lighthouse SEO: **100**.
- **Testing**: 18 Playwright tests cover search, keyboard, mouse drag, trackpad, touch, deep links, prerendered meta, the text-only view and the no-WebGL fallback. They run in CI (`.github/workflows/ci.yml`).
- **Cross-device**: desktop and Pixel 7 emulation, plus software WebGL (SwiftShader). Adaptive DPR, fewer particles and cards on phones, `prefers-reduced-motion` support.
- **RTL**: checked on cards, search suggestions, the text-only view and the wordmark.

### Lighthouse (production build, headless Chromium with *software* WebGL)

| | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| Desktop | 68 | 100 | 100 | 100 |
| Mobile (simulated slow 4G, 4× CPU) | 49–67 (varies between runs) | 100 | 100 | 100 |

Observed first paint is about 0.3 s: a static boot screen, with the 3D chunk lazy-loaded. Blocking time
comes mostly from parsing three.js (~240 KB gzip) and from compiling shaders under SwiftShader. Numbers
on a real GPU should be better. Measuring on real devices is the open item above.

## Scope notes

- In this phase, swipes only reorder the current session: “still learning” brings the card back after
  three more cards, and “known” sends it to the end. Saving that state and moving known words deeper
  are Phase 0.5.
- Per-word social preview *images* are Phase 0.4. Word pages already have title and description tags.

## Needs your input

1. **Permanent hosting.** Connect the repo to **Vercel** or **Netlify** (both free at this scale; config included). Tell me which one, or connect it and share the URL so I can set `SITE_URL` for canonical links and the sitemap.
2. **Content review.** A native speaker should review the 140 words. Headwords are fully vowelled; example sentences are mostly unvowelled, as in normal modern writing.
