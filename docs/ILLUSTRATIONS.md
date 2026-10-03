# Illustrations

Durar's pictures are fine ink and engraving line art, tinted to the sea's aqua, and only where a picture
adds something: flowers and stars first (decision 5). Each one is a public-domain historical plate from
Wikimedia Commons, restyled by a script and credited on [/credits](https://durar.space/credits).

Nothing image-shaped is committed. `src/data/illustrations.json` holds a short entry per picture. CI
fetches the plate once, restyles it, and uploads the results to `img.durar.space`. The site works out
every file name from the entry alone.

## Add an illustration

1. **Find a plate** on Wikimedia Commons and open its file page (the address starts with
   `https://commons.wikimedia.org/wiki/File:`). Check that the licence box says public domain
   (PD-Art, PD-old, PD-scan) or CC0. Prefer files of 2000 px or more.
2. **Add an entry** to `src/data/illustrations.json`, keeping the list sorted by `id`:

   ```json
   {
     "id": "rose-centifolia",
     "sourceUrl": "https://commons.wikimedia.org/wiki/File:Redoute_-_Rosa_centifolia_foliacea.jpg",
     "artist": "Pierre-Joseph Redouté",
     "died": 1840,
     "work": "Les Roses",
     "plate": "Rosa centifolia foliacea",
     "date": "1817–1824",
     "license": "public-domain",
     "alt": "Two cabbage roses in full bloom, with buds, on a leafy stem",
     "style": "colour"
   }
   ```

   Then point a word at it with `"image": "rose-centifolia"`, or a topic with `"cover": "rose-centifolia"`.
3. **Run `npm run validate:data`.** It needs no network and catches typos, unknown ids, licences, dates
   and crop ranges.
4. **Open the pull request.** The `images` check renders the picture and posts a comment, "Illustrations
   in this pull request", with a thumbnail, the credit exactly as it will be published, what Commons says
   about the file, and a link to a review sheet. The sheet shows the source with a 10% grid, the result
   on the sea, and the result faint behind a card's text.
5. **Adjust if needed.** Read the crop off the sheet's grid, set `crop`, and push. The new version renders
   from the archived source, without asking Commons again. Reload the Vercel preview once the check is
   green to see it at `/credits`.

## Fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | lowercase kebab-case, named after what is drawn; becomes part of the file name |
| `sourceUrl` | yes | the Commons file page, never an `upload.wikimedia.org` or thumbnail link |
| `artist` | yes | Latin script |
| `died` | recommended | the artist's death year; must be at least 71 years ago |
| `work` | yes | the book or atlas, Latin script (transliterate Arabic titles) |
| `plate` | no | the plate's own title |
| `date` | yes | `1690`, `1817–1824` (en dash) or `c. 964`; public domain needs 1899 or earlier |
| `license` | yes | `public-domain` or `CC0-1.0` |
| `alt` | yes | what is drawn, at most 150 characters, without "Image of" |
| `scan` | no | the library that digitised it, as a courtesy credit |
| `crop` | no | `[left, top, width, height]` in percent of the source; leave it out the first time (the art is trimmed automatically) |
| `style` | no | `ink` (default) for black-ink engravings and woodcuts, `colour` for colour-printed plates like Redouté's, `colour-yellow` for yellow flowers |
| `flip` | no | mirror the picture (Hevelius drew the sky as seen on a globe); crop out any lettering first |
| `lo`, `hi` | no | ink thresholds, 0–1 (defaults 0.18 and 0.6); raise `lo` to 0.2–0.25 to drop stains |
| `erase` | no | `[[x, y, radius], …]` in percent of the source, for library stamps or stubborn spots |

Changing `sourceUrl`, `crop`, `style`, `flip`, `lo`, `hi` or `erase` (or anything in `PIPELINE` in
`shared/images.ts`) gives the picture new file names. The old files stay on the host, so cached pages that
still point at them keep working. Changing the credit fields or `alt` renames nothing.

## Good sources

- **Stars** (`ink`): Bayer's *Uranometria* (1603), Hevelius's *Firmamentum* (1690, with `flip`),
  Flamsteed's *Atlas Coelestis* (1729), Bode's *Uranographia* (1801), Jamieson (1822), Dürer's star
  charts (1515). In *Urania's Mirror* the stars are punched holes, so only the figures survive.
- **Flowers**: uncoloured line engravings and woodcuts first (Besler's *Hortus Eystettensis*, Fuchs,
  Curtis's *Botanical Magazine*, Sibthorp and Bauer) in `ink`; Redouté with `colour`. Avoid mezzotints
  and aquatints (Thornton's *Temple of Flora*): they have no lines to keep.

## Licences

- **Allowed:** `public-domain` (a print, engraving, woodcut, drawing or manuscript page published before
  1900, by an artist who died at least 71 years ago) and `CC0-1.0`. A faithful scan of a public-domain
  print adds no new rights (EU DSM Directive art. 14, Bridgeman v. Corel); Commons tags these PD-Art or
  PD-scan. A photo of a 3D object (a globe, an astrolabe) counts only if the photo itself is PD or CC0.
- **Refused:** CC BY-SA (every card and share image would have to be share-alike), anything NC or ND
  (ND forbids restyling), GFDL, fair use, "with permission", and unknown licences. If an institution
  claims rights on its copy, take another copy of the same plate.
- **Checked twice:** `validate:data` checks the declared licence, dates and death year offline. CI then
  asks Commons for the file's licence before downloading, and fails if it doesn't match. What Commons said
  that day is archived next to the source.
- **Credit line**, generated from the fields: "After {artist}, “{plate}”, {work} ({date}). Public
  domain. Restyled by Durar." The "After … Restyled by Durar" wording keeps the new look from being
  attributed to the original artist.

## When the check fails

| Message | What to do |
|---|---|
| no such file on Commons … Closest: … | fix the file name (exact capitals and extension) |
| Commons says the licence is … | pick another copy of the plate that is public domain or CC0 |
| the art is N px after the crop … | use a larger file or a looser crop |
| no ink found | check the crop and the style |

## How it works

- **Lookup** (`shared/images.ts`, browser-safe): `recipeHash` hashes the fields that change pixels
  together with `PIPELINE`, so `illustrations/<id>-<hash>-<320|640|960>.webp` is known without a manifest.
  The site reaches the registry through `src/lib/illustrations.ts`, which only lazy chunks import, so
  first-paint JS doesn't grow with the list.
- **Restyle** (`scripts/lib/illustration-pipeline.mjs`): estimate the paper colour locally, turn darkness
  into alpha (a neutrality gate drops foxing and colour washes in `ink`; colour plates use one channel),
  trim, centre in a padded square, and fill with `#cfeef0`. The same input always gives the same bytes.
- **CI** (`scripts/illustrations.mjs`, job `images`): for entries whose files are missing, load the source
  from the archive (`sources/<id>.<ext>` plus a JSON sidecar), or the first time from Commons after the
  licence check, then render and upload write-once. Nothing on the host is ever overwritten.
  `npm run illustrations -- --check` confirms every file is there and served with CORS, which canvases
  need to draw it.
- **Drawing it:** use `loadIllustration(id, px)` for canvases. It resolves null on any failure, so a card
  without its picture still draws. On HTML `<img>` tags use `crossOrigin="anonymous"`, `loading="lazy"`,
  explicit width and height, and the entry's `alt`. Draw behind text at `ILLUSTRATION_ALPHA.behindText`
  (0.18), which keeps pearl text readable.
- **Tests:** browser tests serve illustrations from a generated fixture (`routeIllustrations` in
  `tests/helpers.ts`), so they never depend on the image host. A spec that shows an illustrated word
  should call it.
