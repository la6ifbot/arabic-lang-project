# Durar · Phase 0.6: Content & Topics

## How to use this

This is the next checklist from the brainstorming chat. It starts from `durar-state-2026-10-01.md` and `docs/PHASE-0.5.md`.

How work happens in this project:

- **You build in pull requests. Lativ merges, and a merge goes live.**
- You can't reach the Supabase database or Vercel's production settings. For those, prepare small SQL files and click-by-click steps, and Lativ runs them.

Work top to bottom and stay in scope. At the end, write `docs/PHASE-0.6.md` in the usual report format, then stop and wait. Check in before anything that changes direction, adds a paid service, or adds a recurring cost.

Suggested threads, if you run in parallel:
- **(0)** carry-over and polish (section A). It's small, so do it first
- **(1)** data model, topics and UI (B–E)
- **(2)** images and storage (F)
- **(3)** content pipeline and first batches (G–H)

Thread 1 defines the schema the others use, so it lands first.

---

## Where things stand (1 Oct)

- Live on durar.space: 140 words, mastery (five boxes), the Library, share, the text-only view, pinch-to-zoom, and the "?" and "What is Durar?" boxes.
- Arabic font: **Noto Naskh Arabic** everywhere.
- Email is fully live from `pearl@durar.space` (SES production access, 07:00 Amsterdam, health check at 08:15). Sign-up, reset and Google sign-in all work.
- Open: PR #17 (first-visit help, which **also fixes main's red CI**); PR #16 (background music, waiting for Lativ's track); a friend's subscription that isn't in the list; Google's brand check; `SES_RATE_PER_SECOND=1` (about 250 subscribers max); Vercel's plain 404.

---

## Decisions already made (don't re-litigate these)

### Topics & content
1. **Durar stays Arabic-first.** Topics are **themed collections of Arabic words**, not general-knowledge subjects. A general-knowledge sister site is a separate, later idea.
2. **A word can belong to several topics**, but always has **one** page, `/word/<slug>`.
3. **Content stays as static files in the repo**, which keeps the site fast, cheap and good for SEO. Topics live in a registry file, and words list their topic ids.
4. **The editing surface is a Google Sheet.** An import script validates it and opens a PR, and the Vercel preview shows the new cards before Lativ merges. No admin app.
5. **Illustrations, not photos, in one style:** fine ink or engraving line art, tinted to the water palette. Use them only where a picture adds something (flowers, stars and constellations). The first choice is public-domain historical plates, restyled, and every image is credited.
6. **Images move out of the repo** to **S3 + CloudFront** in Lativ's AWS account (the same account as SES), served from `img.durar.space`. **Check in with a cost estimate before creating anything.**
7. **Pearl of the Day stays global.** Mastery stays per word.
8. **Original writing only.** Dictionaries and lexicons are references, never copied (some licences, e.g. CC BY-SA, would force share-alike licensing and attribution). Every etymology and star-name claim gets a recorded source.

### Polish (from the 1 Oct state)
9. **Music is off by default.** The speaker button invites it, maybe with one gentle pulse on a first visit. Sound never starts unless the visitor asks for it. Remember their choice.
10. **First-visit help never covers a shared word.** Visitors arriving on `/word/<slug>` see the word first. Help waits until they interact or for a few seconds, or just shows a small hint.
11. **Google brand fallback:** only if Google refuses the brand check, switch to Google's own sign-in button on durar.space with Supabase's ID-token sign-in (free). Don't buy a Supabase custom domain.

---

## Launch topics (Lativ may rename them)

Each topic has an English and an Arabic name, and **at least 20 words**, for about 300 in total.

| Topic | Notes |
| --- | --- |
| **The whole sea** | The default: every word |
| **Sea & water** | Mostly existing words |
| **Sky & stars** | Including star names that come from Arabic (Aldebaran ← الدَّبَرَان, Altair ← الطَّائِر, Deneb ← ذَنَب, Rigel ← رِجْل, Vega, Fomalhaut, Algol, Betelgeuse…), with constellation illustrations |
| **Flowers & scent** | With botanical illustrations |
| **Words the world borrowed** | algebra, alchemy, alcohol, coffee, sugar, cotton, magazine, admiral, zenith… (a sourced etymology on each) |
| **Desert** | Mostly existing words |
| **Feeling & virtue** | From existing words |
| **Poetry & language** | Existing words, plus the attributed classical lines |

Propose how the existing `tags` map onto these, for Lativ to confirm.

---

## Checklist

### A. Carry-over & polish (thread 0, first)
- [ ] **Main green again:** get PR #17's CI fix merged (or split it out) before anything else lands
- [ ] **First-visit help:** apply decision 10 to PR #17 before it's merged
- [ ] **The friend's subscription:** *already in progress in the Email thread. Don't start a duplicate; fold its findings into this phase's report.* Report the cause and fix it if it's a bug. Then add an end-to-end check of subscribe → confirm with **non-Gmail inboxes** (Outlook/Hotmail and iCloud), including whether mail lands in the inbox or spam. Give Lativ a short test script to run with real addresses
- [ ] **Custom MAIL FROM** (`mail.durar.space`): give owner steps (an MX and an SPF record at Namecheap, and the SES setting). This aligns SPF too, which helps with Outlook. Don't touch the root SPF record
- [ ] **Sending capacity:** give Lativ steps to raise `SES_RATE_PER_SECOND` to a safe value under SES's account maximum send rate. Update `OPERATIONS.md` with the subscriber capacity this gives, and with when to raise it again
- [ ] **Alerts:** suggest `ALERT_EMAIL=hello@durar.space` (optional; it forwards to Lativ anyway)
- [ ] **Branded 404:** a static Durar-style page (water, a lost pearl, search, and a link back to the sea) served with a real **404** status on Vercel, `noindex`, and correct RTL. Axe clean
- [ ] **Music (PR #16):** apply decision 9. Credit the track on the Credits page (section F). Respect the system mute and don't play in background tabs. Keep the file small and lazy-loaded
- [ ] **Google brand:** if Google has answered by then, record the result. If it was refused, give a short plan for decision 11 (don't build it unless Lativ says so)

### B. Data model
- [ ] `src/data/topics.json`: `id`, `name.en`, `name.ar`, a short `description` in both languages, `order`, an optional `cover`
- [ ] Words gain `topics: string[]` (replacing `tags`, via a migration script), plus optional `image` (`src`, `alt`, `credit`, `license`, `sourceUrl`) and `etymology` (`text`, `source`)
- [ ] The validator enforces:
  - the headword has diacritics
  - the transliteration format
  - 1–3 examples
  - topic ids exist
  - `added` is present (keeps Pearl of the Day stable)
  - borrowed words have `etymology.source`
  - images have a credit and a licence
  - slugs are unique
- [ ] No existing `/word/<slug>` URL changes, and saved pearls and progress still match

### C. Topic picker
- [ ] A quiet control next to search: **"The whole sea"** plus the topics, with Arabic and English names. Keyboard-operable, with proper roles
- [ ] Switching: the current cards sink and the topic's cards rise, slowly. With reduced motion, a fade
- [ ] The choice is remembered: browser storage for everyone, plus a profile preference when signed in
- [ ] The URL reflects the topic (`/sea/<topic>`). `/` is the whole sea, and Pearl of the Day stays first on `/`
- [ ] The mastery queue respects the topic. If the topic has nothing new or due, show a gentle note offering the whole sea
- [ ] Works with pinch-to-zoom and the text-only view

### D. Topic pages & SEO
- [ ] Prerendered `/sea/<topic>` pages: an intro in both languages, the word list (linking to the word pages), and an OG image (topic cover plus signature). Unique meta on each, all in the sitemap
- [ ] Word pages link to their topics
- [ ] For a live visitor, a topic page opens the sea filtered to that topic
- [ ] SEO stays at 100

### E. Search, Library, sharing, email
- [ ] Search covers every topic, with topic chips. When a topic is chosen, its matches come first
- [ ] Library: a topic filter
- [ ] Share image: include the illustration when the word has one. The signature rule is unchanged
- [ ] 3D card: the illustration is drawn faintly into the card texture without reducing text contrast. Check memory on phones, and that zoom still fits
- [ ] Email: an optional "from the Sky & stars sea" line. The no-tracking check still passes

### F. Images & storage
- [ ] **Check in first** with a cost estimate
- [ ] Owner steps, click by click:
  - an S3 bucket (eu-central-1, private)
  - CloudFront with origin access control
  - an ACM certificate for `img.durar.space` in us-east-1
  - a CNAME at Namecheap
  - an upload-only IAM user for that bucket
- [ ] CI renders changed cards and uploads them with content-hashed names. Each word's image URL comes from a manifest. **The manual card-generation step goes away**
- [ ] Move the existing card images to storage and out of the repo. Don't rewrite git history without asking
- [ ] OG, email and share images load from `img.durar.space`. Verify the link previews. Mention the image host on the Privacy page
- [ ] An illustration pipeline (source → cleaned and tinted → web sizes), and a **Credits** page (`/credits`) for every image and the music track, linked from Privacy

### G. Content pipeline
- [ ] Owner steps to create the Google Sheet (one row per word, a topics tab, Arabic shown right-to-left)
- [ ] Import script: published CSV → validate → data files → a PR with a summary (new, changed, removed, plus warnings). **Removals need explicit confirmation**
- [ ] The preview link appears in the PR
- [ ] A `draft` / `reviewed` status per word for the native-speaker review. Both show on the site for now, and the report lists what's still unreviewed
- [ ] `docs/CONTENT.md`: how to add a batch, the style guide (tone, example length, transliteration, when to add an image), and the licensing rules (decision 8)

### H. First batches
- [ ] Draft about 160 new words to reach about 20 per topic, especially Sky & stars, Flowers & scent and Words the world borrowed. Write them fresh, with sources recorded
- [ ] Deliver them in batches of about 25 (one PR each), so Lativ can review in small pieces
- [ ] Illustrations for the flower and star words that benefit, with credits

### I. Tests
- [ ] Unit: the validator, the tags → topics migration, the topic-filtered queue, the manifest lookup
- [ ] Playwright: the picker (mouse, keyboard, touch); the switch and reduced-motion fade; URL and back/forward; the remembered choice; topic pages open the filtered sea; search chips; the Library topic filter; share with an illustration (the signature is still present); the 404 page (status and content); music off by default and remembered; first-visit help doesn't cover a shared word; text-only parity; axe clean
- [ ] Build: topic pages are prerendered with unique meta, and the sitemap includes them
- [ ] Import script: a fixture sheet produces the expected PR diff, and invalid rows fail
- [ ] Main's CI stays green throughout. All existing tests still pass

---

## Quality bar (same as every phase)

- **Accessibility:** zero axe violations. Lighthouse 100. Every illustration has alt text. Audio is controllable and never starts on its own.
- **SEO:** 100 on word and topic pages. The 404 page is `noindex`.
- **Performance:** first-paint JS grows by no more than about 1.5 KB. Images and music are lazy. Mobile Lighthouse doesn't fall below today's ~65 (measured live).
- **RTL:** everywhere new text appears.
- **Privacy:** no tracking. The image host is documented.
- **Licensing:** every image and track is credited and every etymology sourced. No copied dictionary text.

**Definition of done:** all PRs merged by Lativ and verified on durar.space, images served from `img.durar.space`, the first batches reviewed and merged, `docs/PHASE-0.6.md` and `docs/CONTENT.md` written. Then stop and wait.

---

## Lativ's actions this phase (one ordered list in the report)

1. Merge PR #17 once CI is green.
2. Send your music track for PR #16.
3. Run the subscribe test with an Outlook and an iCloud address.
4. Add the custom MAIL FROM records, and raise `SES_RATE_PER_SECOND`.
5. Confirm or rename the topics, and confirm the tag mapping.
6. Approve the S3 cost estimate, then do the AWS and Namecheap steps.
7. Create the Google Sheet.
8. Review each batch's preview and merge.
9. Request Google's brand re-check (2 Oct, after 12:00).

---

## Backlog (not this phase)

- **0.7:** a mobile performance pass on the 3D scene (target clearly above 65 on real phones), streaks, pronunciation audio, root-family visuals, an optional anonymous "most shared" count, and tightening DMARC.
- **Later:** a general-knowledge sister site on the same engine, only if Durar proves people love the experience itself.
- **Ongoing:** the native-speaker review of every word.
