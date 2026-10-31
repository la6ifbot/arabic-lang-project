# Durar · Phase 0.8: Voice & Fullscreen

## How to use this

This is the next checklist from the brainstorming chat. It continues from the Phase 0.7 report (closed 25 Oct). Same rules as always:

- Pull requests only. Lativ merges, and a merge goes live.
- Database changes go through the migrations pipeline.
- Check in before anything that changes direction, adds a paid service, or adds a recurring cost.
- At the end, write `docs/PHASE-0.8.md`, then stop and wait.

Suggested threads (all can run in parallel):
- **(1)** Voice (B)
- **(2)** Fullscreen & installable app (C)
- **(3)** Anatomy polish & carry-over (A, D)

---

## Where things stand (25 Oct)

- 497 words (all dictionary-checked and marked reviewed), 7 topics, mastery, saved pearls, Library, search, topic pages, pinch zoom, and the anatomy of a word (letters, syllables, shadda).
- Google sign-in, the daily email, nightly encrypted backups with a passed restore test, staging plus a migrations pipeline, a health check, a weekly digest, Download my data, Turnstile, a CSP and Dependabot.
- **The Deep is parked** behind a flag. Leave it off.
- **Tide (cards drifting by on their own) is parked.** Don't build it in this phase.
- **Custom MAIL FROM is dropped** (the free Namecheap forwarding breaks with it).
- Lighthouse: accessibility and SEO 100, performance about 65.

---

## Decisions already made (don't re-litigate these)

### Voice
1. **Audio is generated once, never live.** Amazon Polly (eu-central-1) creates one file per **headword** and per **example sentence**, from the fully vowelled text.
   - CI generates it when a word is added or changed, like the card images.
   - Files are stored in the existing S3 + CloudFront setup (e.g. `img.durar.space/audio/…`) with content-hashed names. Serving it costs nothing extra.
   - **Check in first** if the one-time generation would cost more than about $5. All ~500 words and sentences should cost well under $1, and may fit Polly's free tier.
   - Amazon allows storing and replaying Polly audio at no extra cost.
2. **Voice audition first.** Before generating everything, make 10 words and 3 sentences in each suitable Polly Arabic voice (e.g. Zayd and Hala, which are neural, and Zeina, which is standard) and post them in a PR for Lativ to choose **by ear**. If none is good enough, check in about alternatives. Don't open accounts with new providers without asking.
3. **Fixing mispronunciations:** an optional per-word override (a different spelling for the voice, or a phoneme override) in the word data, and a "regenerate this word" path. Report a spot-check list of words likely to be read wrong (shadda, hamza, al-, tanwīn, rare words), so Lativ can listen to those first.
4. **Speaker buttons:**
   - **Never autoplay.** Small speaker buttons next to the headword and next to the example sentence on the focused card, in the text-only view, on `/word/<slug>` pages, and as a whole-word button in the anatomy panel.
   - A **slow** option (about 0.75× in the browser, pitch preserved, no extra files).
   - Background music quietly dips while a word plays.
5. **The email doesn't get audio** (email apps block it). Optionally add a small "Hear it on Durar" link next to the word, without tracking.

### Fullscreen & installable app
6. **A fullscreen button wherever the browser allows it** (desktop, Android, iPad). Esc or the button exits. The icon switches between enter and exit. Shortcut `F`. **Hidden on iPhone**, which only allows video fullscreen. Use feature detection, not device sniffing. Fullscreen always starts off.
7. **Installable web app:** a proper manifest and icons, opening without browser bars once installed. On iPhone Safari, show a one-time, dismissible hint: "Tip: add Durar to your Home Screen for full screen." Never show it if Durar is already running as an installed app. No offline mode yet (backlog).

### Anatomy polish
8. **New hint wording:** **"Tap a letter to see its four shapes"** on touch screens, and **"Click a letter to see its four shapes"** with a mouse, picked automatically.
9. **A teaching animation**, shown only the first 3 times someone opens Letters, and never again once they've tapped a letter:
   - **Peek:** after the letters spread out, the first (rightmost) letter lifts slightly, its standalone shape fades in faintly beside it for about a second, then fades away.
   - **Glint:** a soft light passes across the letters one by one, right to left, like light on pearls.
   - **Hover** (mouse): letters lift and glow a little, with a pointer cursor.
   - **Reduced motion:** nothing moves; letters get a faint dotted underline so they still look tappable.
   - Every letter is a real button, read out as, for example, "lām. Show its four shapes."

---

## Checklist

### A. Carry-over
- [ ] Finish the open 0.7 items: the letter-table check and the al- syllables check
- [ ] Keep The Deep's flag off, and keep its tests running with the flag on

### B. Voice (thread 1)
- [ ] Owner steps: give the CI's AWS user **only** `polly:SynthesizeSpeech` (or a new Polly-only user), plus the GitHub secret
- [ ] The audition PR (decision 2), with a short listening page or links
- [ ] After Lativ picks: the generation script in CI, the content-hashed upload, and a manifest lookup (word → audio URL), plus a cost line in the report
- [ ] Data fields: `audio` (generated) and an optional pronunciation override. The validator checks that every word and sentence has audio
- [ ] The speaker buttons (decision 4): loading, failure ("Audio unavailable") and playing states; a live-region announcement; shortcut `P` (play the word; Shift+P for the sentence); prefetch the focused card's audio when idle; music ducking
- [ ] Credits page: "Voice generated with Amazon Polly". Privacy page: no change at runtime, because audio comes from our own image host
- [ ] The spot-check list (decision 3) in the report

### C. Fullscreen & installable app (thread 2)
- [ ] The fullscreen button (decision 6), placed near "?" and the music button
- [ ] Manifest, icons and theme color (decision 7). Verify Android installs it and that the iPhone home-screen version opens without Safari's bars
- [ ] The iPhone hint: at most once, dismissible, never in the installed app

### D. Anatomy polish (thread 3)
- [ ] The new wording (decision 8)
- [ ] Peek, glint, hover and the reduced-motion underline (decision 9), remembered per device
- [ ] The whole-word speaker in the anatomy panel (once B lands)

### E. Tests
- [ ] Unit: audio manifest lookup and validator; the "show the teaching animation?" logic; fullscreen and install-hint feature detection
- [ ] Playwright:
  - speaker buttons by mouse, keyboard and touch; slow mode; failure state; no autoplay anywhere
  - fullscreen enter and exit (desktop); the button is hidden where unsupported
  - the install hint appears once on simulated iPhone Safari, and never in the installed app
  - anatomy wording on touch and mouse; peek and glint shown 3 times, then gone, and never after a letter tap; the reduced-motion underline
  - text-only parity; axe clean
- [ ] All existing tests still pass, and main stays green

---

## Quality bar (same as every phase)

- **Accessibility:** zero axe violations. Lighthouse 100. Audio never starts on its own. The fullscreen button and the speaker buttons are labelled and keyboard-operable.
- **SEO:** 100. Word pages get their speaker button without breaking anything.
- **Performance:** first-paint JS grows by no more than about 1.5 KB. Audio code and files load lazily (only the focused card is prefetched).
- **Privacy:** no new third parties at runtime.
- **RTL:** everywhere new text appears.

**Definition of done:** merged and verified on durar.space, audio live for every word and sentence in the voice Lativ chose, fullscreen working on desktop and Android, the iPhone install path checked, the anatomy polish live, `docs/PHASE-0.8.md` written. Then stop and wait.

---

## Lativ's actions this phase

1. Add the Polly permission and the GitHub secret.
2. Choose the voice from the audition by ear.
3. Listen to the spot-check list and flag anything that sounds wrong.
4. Test fullscreen on a computer and Android, and "Add to Home Screen" on your iPhone.
5. Still open: the music track for the background music.

---

## Backlog (not this phase)

- **Tide:** parked. Cards drifting by on their own, a screensaver mode, `durar.space/tide`.
- **The Deep:** parked. Maybe later in a simpler form.
- Email sending at SES's full 50,000 a day. Custom MAIL FROM (needs a paid mailbox).
- Star and flower pictures; the topic names review.
- A mobile performance pass (above 65 on real phones), an offline mode for the installed app, streaks, root-family visuals, an optional anonymous "most shared" count, tightening DMARC.
- Letter-name audio in the anatomy panel, and optionally recording the 497 headwords in a human voice.
