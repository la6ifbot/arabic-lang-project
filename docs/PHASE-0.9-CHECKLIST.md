# Durar · Phase 0.9: Found & Rooted

## How to use this

This is the next checklist from the brainstorming chat. It continues from the 16 Nov status (Phase 0.8 closed). Same rules as always:

- Pull requests only. Lativ merges, and a merge goes live.
- Database changes go through the migrations pipeline.
- Keep costs near zero. Check in before anything that changes direction, adds a paid service, or adds a recurring cost.
- At the end, write `docs/PHASE-0.9.md`, then stop and wait.

This phase has three goals:
1. **Swiping is clear.** There's a new gesture model, and testers found the old one confusing.
2. **People can find Durar** (Google, Bing, Pinterest, speed).
3. **Durar teaches more deeply** (root families and the reading-direction reminder).

Threads:
- **(1)** new gestures (B). **First priority**
- **(2)** search-friendly pages (C)
- **(3)** speed pass (D)
- **(4)** root families (E)
- **(5)** reading-direction reminder (F)
- **(0)** carry-over and cost safety (A)

Threads 0, 2 and 3 can start at once. Thread 4's **data** PRs can start at once, but its Root view UI waits until thread 1 has merged, and its word-page section waits for thread 2's page template. Thread 5 waits for thread 1, because the hints have to fit the new gestures and tour.

---

## Where things stand (16 Nov)

- 497 dictionary-checked words in 7 topics. Mastery, saved pearls, Library, search, share, text view, pinch zoom, anatomy (letters, syllables, whole-word speaker).
- Voice: Polly "Zayd" for every word and all 593 sentences.
- Fullscreen, installable app, phone layout fixed.
- A 5-step first-time tour, the book button for hard words, a back button, and labelled swipe arrows ("learning" / "I know this").
- Google sign-in, the daily email, the weekly digest, backups, monitoring, Download my data.
- **Parked:** The Deep, Tide, background music, star and flower pictures, the topic names review, the letter table, al- syllables.
- **Limits:** costs near zero, no paid mailbox, CloudFront stays on the free plan, the repo stays public. **No tracking or analytics on the site.**
- Lighthouse performance was about 65 last time it was measured, before voice, fullscreen and the layout fix.

---

## Decisions already made (don't re-litigate these)

### New gestures (thread 1)
1. **Swipe right = next card. Swipe left = previous card**, like turning pages in an Arabic book. **Left and right never change progress.**
2. **Swipe up = "I know it."** The card rises, catches the light, then sinks into the deep. The server rules stay the same: it only moves deeper when the word is new or due. Otherwise show "Already in the deep · returns in N days".
3. **There's no gesture for "still learning."** Any word you don't mark comes back on its normal schedule. A due word you skip stays due.
4. **Undo:** after "I know it", a quiet "Undo" for about 5 seconds. Swipe left and the back button bring back the previous card.
5. **Keyboard:** ← next, → previous (matching the right-to-left page turn), ↑ "I know it". **Mouse and trackpad:** horizontal drag or two-finger swipe for next and previous; an upward drag or the button for "I know it".
6. **On-screen buttons replace the labelled arrows:** "Next" and "Previous" (icon plus text, placed to match the right-to-left direction), plus an "I know it" button for people who don't swipe. Proper labels for screen readers.
7. **Show what will happen while dragging:** "Next", "Previous" or "↑ I know it" fades in with the drag distance. **Once, on someone's first card,** a gentle nudge to the right shows the direction.
8. **Gesture conflicts:**
   - When a card is zoomed, a vertical drag pans the card; "I know it" doesn't fire.
   - Block pull-to-refresh and overscroll.
   - Ignore swipes that start at the bottom edge of the screen (the iPhone home gesture).
9. **Update everything that explains swiping:** the first-time tour, the "?" help, the text-only view, the Library wording, and any copy that says "left = learning".
10. **The book button (hard words) and the back button get more noticeable:** visible labels, and the tour points them out. (A tester asked for both without noticing they already exist.)

### Being found (thread 2)
11. **Search Console and Bing Webmaster Tools**, verified with a DNS record at Namecheap, with the sitemap submitted. Bing imports from Search Console. They show which searches find Durar **without any tracking on the site**.
12. **Word pages match how people search.**
    - Title pattern: **"Musk in Arabic: مِسْك (misk), meaning, pronunciation and how to write it | Durar"**, using the main English meaning. Every title is unique.
    - The prerendered page shows, as real readable text: the meaning(s), examples with translations, the audio player, the letter breakdown (letters, count, which ones join), syllables, the root family with links (thread 4), and topic links.
    - **No keyword stuffing.** It has to read naturally for people.
13. **Topic pages become proper guides.** Each gets an original intro (about 150–300 words) and a title that matches real searches, for example:
    - Sky & stars → "Arabic star names and their meanings"
    - Words the world borrowed → "English words that come from Arabic"
    - Feeling & virtue → "Beautiful Arabic words about longing and love"

    Topic names in the app stay as they are (the names review is parked). Only page titles and intros change.
14. **Structured data:** keep `DefinedTerm`, and add `BreadcrumbList` (so results can show "Durar › Flowers & scent › Musk") and an audio object where it's valid. No fake FAQ markup.
15. **Pinterest:** "Save to Pinterest" in the Share menu, as a **plain link** to Pinterest's pin-create page with the word page URL, the tall card image and a description. **No Pinterest script, no tracking.**

### Speed (thread 3)
16. **Measure first, then cut**:
    - live Lighthouse (mobile and desktop) and Core Web Vitals (LCP, INP, CLS)
    - Lativ's iPhone and a Samsung
    - Search Console's Core Web Vitals report once it has data

    Targets: **mobile Lighthouse 80+** where the lab allows (a GPU-less lab may stay lower, so report both), LCP under 2.5 s, INP under 200 ms, CLS under 0.1. **The look must not get worse.**
17. **A performance budget in CI**: Lighthouse CI on preview builds plus bundle-size checks, so later phases can't slowly make it slower.

### Root families (thread 4)
18. **Every word gets a root** (e.g. ك ت ب). Loanwords and words without a meaningful root get `root: null` with a short reason.
    - Same review standard as the words: checked against the dictionaries, uncertain items listed in each PR, Lativ approves.
19. **A roots registry** (`src/data/roots.json`). Each root has its letters, a core meaning (English and Arabic), and **2–4 well-known relatives** (Arabic, transliteration, meaning), even when they aren't Durar cards. That way every root family is useful.
    - Relatives that **are** Durar cards are tappable.
    - Relatives get Polly audio too (it costs cents).
    - **Original writing only.** Dictionaries are references, never copied.
20. **In the app:** a "Root" view next to Letters.
    - The root letters appear as **three pearls on a thread**, consistent with Letters.
    - **Inside the word, the root letters glow** while the pattern letters stay dim (e.g. in مَكْتَب, ك ت ب glow and م doesn't). Heuristic matching, with a manual override field, and uncertain cases flagged.
    - Tapping a family word that's a Durar card makes that card rise into focus.
21. **Root pages** (`/root/k-t-b`) are prerendered **only for roots with 3+ entries** (cards plus relatives), so there are no thin pages. They're in the sitemap and linked from word pages.

### Reading direction (thread 5)
22. **A pearl glides right to left** under the headword, then under the example sentence, with a faint **"← Arabic reads right to left"**. Then it fades after about 3 seconds.
    - It appears on the **first 3 cards of someone's first 2 visits**, and stops for good once they've opened Letters.
    - Never in share images. Hidden from screen readers, which read Arabic correctly anyway.
    - Reduced motion: the pearl stays still and only the text fades.
23. **One hint at a time, in this order:** the first-time tour → the right-swipe nudge (decision 7) → the reading-direction pearl → the "Tap the word" hint. Nothing ever stacks or overlaps.

### Cost safety (thread 0)
24. **An AWS budget alert**, emailing Lativ at **$5 and $20 a month**. **No automatic stop**, because a stop could take down images, audio or email. (The first couple of AWS budgets are free.)

---

## Checklist

### A. Carry-over & cost safety (thread 0)
- [ ] Owner steps for the AWS budget alert (decision 24)
- [ ] Measure and record the **starting** Lighthouse and Core Web Vitals numbers live, before any changes

### B. New gestures (thread 1, first priority)
- [ ] Gestures, keyboard, mouse and trackpad (decisions 1–5), with the server rules unchanged for "I know it"
- [ ] Undo, and back via swipe left or the button
- [ ] The Next, Previous and "I know it" buttons (decision 6), replacing the old labelled arrows
- [ ] Drag labels, plus the one-time right nudge on the first card (decision 7)
- [ ] Conflict handling: zoom, pull-to-refresh, bottom edge (decision 8)
- [ ] Every explanation updated: tour, "?" help, text-only view, Library, all copy (decision 9)
- [ ] The book and back buttons made noticeable and pointed out in the tour (decision 10)
- [ ] Attach a before/after screen recording from an iPhone and a Samsung to the PR

### C. Search-friendly pages (thread 2)
- [ ] Owner steps, click by click:
  - Search Console → Add property → **Domain** → `durar.space`
  - copy the `google-site-verification=…` text
  - Namecheap → Advanced DNS → Add **TXT Record**, Host `@`, paste it as the value
  - Verify
  - Sitemaps → submit `https://durar.space/sitemap.xml`
  - Bing Webmaster Tools → **Import from Google Search Console**

  Then report how many pages are indexed after a few days
- [ ] Word page template and title builder (decision 12), with uniqueness tested across all 497
- [ ] Prerendered readable sections: meanings, examples, audio, letter breakdown, syllables, topic links. Leave a slot for the root section (thread 4)
- [ ] Topic page intros and search-matched titles (decision 13), written fresh, in one PR for Lativ to read
- [ ] Structured data (decision 14), validated with Google's Rich Results Test
- [ ] "Save to Pinterest" in the Share menu (decision 15)
- [ ] Optional: add Search Console clicks and impressions to the weekly digest, using a read-only service account. Owner steps if chosen

### D. Speed pass (thread 3)
- [ ] Find the biggest costs on phones. Likely: the three.js bundle size; Arabic font size (subset Noto Naskh Arabic to the needed characters, WOFF2, preload); work at startup (tour, sign-in, audio and search code should load when idle); text-texture drawing on the main thread (move it off where supported); scene cost on phones (background cards, particles, scene resolution, while keeping the focused card's text sharp)
- [ ] Fix them, measure again, and report before and after (numbers plus a short screen recording to prove the look hasn't changed)
- [ ] The CI performance budget (decision 17)

### E. Root families (thread 4)
- [ ] The roots registry format and validator (decisions 18–19)
- [ ] Root data for all 497 words, in batches of about 100 (one PR each, with uncertain items listed)
- [ ] Relatives with meanings and Polly audio
- [ ] The Root view (decision 20), after thread 1 merges. Keyboard, screen reader and reduced motion
- [ ] The root section on word pages, and `/root/...` pages for roots with 3+ entries (decision 21), in the sitemap
- [ ] The first-time tour mentions Root in its Letters step (one short line)

### F. Reading-direction reminder (thread 5, after thread 1)
- [ ] The pearl glide and text (decision 22)
- [ ] The one-hint-at-a-time order (decision 23), remembered per device

### G. Tests
- [ ] Unit: gesture classification (horizontal, vertical, zoomed, bottom edge); the title builder (all unique); root data validation; the root-letter highlighting heuristic and overrides; the hint order; the Pinterest link builder
- [ ] Playwright:
  - gestures on touch, mouse, trackpad and keyboard; left and right **never** change progress; up follows the server rules; undo; the zoom conflict; drag labels; the first-card nudge only once
  - the tour and help copy describe the new gestures
  - the Root view (open, family list, tapping a card focuses it, keyboard, axe); root pages prerendered with unique meta
  - word pages contain the readable sections
  - the reading-direction pearl on first visits only, never stacking with other hints, gone after Letters
  - reduced motion; text-only parity; axe clean
- [ ] CI: the performance budget runs on previews
- [ ] All existing tests still pass, and main stays green

---

## Quality bar (same as every phase)

- **Accessibility:** zero axe violations. Lighthouse accessibility 100. Everything you can do by swiping can also be done with buttons and the keyboard.
- **SEO:** 100 on word, topic and root pages. Pages read naturally.
- **Performance:** the CI budget is set, and mobile is clearly better than the starting numbers.
- **Privacy:** still no tracking on the site. Pinterest is a plain link only.
- **Costs:** near zero. Report any Polly cost for the relatives.
- **RTL:** everywhere new text appears.

**Definition of done:** merged and verified on durar.space, the new gestures live and the tour updated, Search Console and Bing verified with the sitemap submitted, root data for all words approved, root view and root pages live, the speed improvements measured live, the reading-direction pearl live, `docs/PHASE-0.9.md` written. Then stop and wait.

---

## Lativ's actions this phase

1. The AWS budget alert.
2. Search Console and Bing verification (one DNS record), and submit the sitemap.
3. Try the new gestures on your phone, and ask your tester to try again.
4. Read the topic page intros.
5. Approve the root batches, starting with the uncertain items in each PR.
6. A speed check on your iPhone, and on a Samsung if your friend can.
7. Optional: create a Pinterest account for Durar, and pin a few cards a week.

---

## Backlog (not this phase)

- **0.10:** a free email course, "The Alphabet in 28 days" (one letter a day, to grow the list), and a "Friend of Durar" pay-what-you-want supporter option, through a merchant-of-record payment service that handles EU VAT.
- **0.11:** "Durar Letters", a paid weekly deep-dive email (a root family, a line of poetry explained, the story behind a word, a printable practice sheet).
- **Later:** prints and wall art, a tasteful tutor affiliate link, offline mode, gentle streaks, an optional "Practice" mode (reveal the meaning, then rate yourself).
- **Parked:** The Deep, Tide, background music, star and flower pictures, the topic names review, the letter table, al- syllables.
