# Phase 0.8 — Voice & Fullscreen: report

Live: https://durar.space, deployed from `main` at `2c82ad5` (PR #86, merged 15 Nov 00:17 UTC). Every
headword and example sentence on Durar can now be heard in **Zayd**, an Amazon Polly voice. The audio
is made once in CI and played from our own image host, and it never starts on its own. Durar can go
**fullscreen** and can be **installed** like an app (Android, and the iPhone home screen). The letters of
a word now **teach themselves**: a hint, a short peek and glint, and a speaker for the whole word.

The phase ran from 31 October to 15 November in four threads: Thread 0 (checklist, Dependabot and this
report), voice (B), fullscreen and installable app (C), and anatomy polish and carry-over (A, D). Lativ
did the Polly key and the audition on 13 Nov, picked Zayd, approved the vowelled sentences on 14 Nov,
and checked the phone layout, fullscreen and the home-screen app on real devices. **The phase is done.
Nothing waits on Lativ.**

The checklist is [`PHASE-0.8-CHECKLIST.md`](PHASE-0.8-CHECKLIST.md) (#77).

Legend: **[x]** done and verified · **[~]** partly done, or deferred by choice · **[ ]** not done

## A. Carry-over

- [x] **Letter table and al- syllables.** Both were finished at the end of 0.7 in #74 (25 Oct): the
  letter table needed no change, and the 21 guessed al- splits were right and are now locked.
- [x] **The Deep stays parked.** `VITE_DEEP_ENABLED` is unset in production, so `/deep` sends people back
  to the sea. Its tests still run in CI with the flag switched on.

## B. Voice (PRs #78 and #83)

- [x] **Owner steps.** Lativ made the IAM user `durar-voice`. Its inline policy `DurarPollySpeakOnly`
  allows only `polly:SynthesizeSpeech`. Lativ also added the GitHub secrets `POLLY_AWS_ACCESS_KEY_ID`
  and `POLLY_AWS_SECRET_ACCESS_KEY`.
- [x] **Audition.** The `Voice audition` workflow made 10 words and 3 sentences in each Polly Arabic
  voice (Zayd and Hala, which are neural, and Zeina, which is standard) for a listening page at
  `img.durar.space/audio/audition/v1/`. Lativ liked both Hala and Zayd. To keep costs down Lativ chose
  one, **Zayd** (13 Nov). There is no voice switch for visitors.
- [x] **Generation in CI.** `scripts/voice.mjs` runs in the CI images job. It reads the vowelled text
  and uploads one MP3 per headword and per sentence to `img.durar.space/audio/zayd/<hash>.mp3`. The
  hashes come from the content, so anything unchanged is never made again. The word-to-file lookup is
  a lazy chunk. `npm run voice -- --check` fails the build if any word or sentence has no audio.
- [x] **Fixing a misreading.** An optional `say` field per word (`ar`, `ipa` or `take`) gives the
  voice a different spelling or phonemes. The steps are in [`CONTENT.md`](CONTENT.md) → Voice.
- [x] **Vowelled sentences (#83).** Read without vowel marks, many sentences came out wrong or rushed.
  All 593 now have a voice-only `say.ar` with full tashkeel. The site still shows them as written, and
  a unit test checks that only marks were added, never letters. They are read at 90% speed.
  Headwords keep the normal speed. Lativ approved the samples on 14 Nov. Note: the vowelling was
  done from grammar and from knowledge of the standard texts, not looked up in dictionaries online.
  The PR lists the choices that could be argued, such as which names drop tanwīn and the famous
  lines of poetry.
- [x] **Speaker buttons.** One sits by the headword and one by the example sentence on the focused
  card, in the text-only view and on `/word/<slug>`, plus a whole-word speaker in the anatomy panel
  (#82). Each has loading, playing and "Audio unavailable" states, a live-region announcement, and
  shortcuts `P` (word) and `Shift+P` (sentence). Only the focused card's audio is fetched ahead, when
  the browser is idle. Nothing ever autoplays. A **slow voice** (0.75×, pitch kept) is a setting in the
  "?" menu. #85 took the 0.75× switch off the card's own row.
- [~] **Music ducking.** The hook is there (a `durar:voice` event), but the site has no background
  music yet (#16 still has no track), so there is nothing to dip.
- [x] **Credits and privacy.** Credits say "Voice generated with Amazon Polly". The audio comes from our
  own image host, so no new third party runs on the page.
- [x] **Email.** No audio, as decided.
- [x] **Spot-check list.** `npm run voice -- --spot-check` lists 63 words (shadda, hamza, al-, tanwīn,
  madda, multi-word names): `phase-0.8/durar-voice-spot-check.md` in the project files. Lativ listened
  and said the words "are good and pronounced nicely". None needed a `say` fix.
- **Cost:** about **$0.94, once**: the audition about $0.02, the first full run about $0.38 (about
  23,800 neural characters, 1,090 files), and the sentence re-record about $0.54 (593 files). New or
  changed words cost a fraction of a cent each. The files take a few MB in the existing bucket and
  are served by the free CloudFront plan.

## C. Fullscreen and installable app (PRs #79 and #85)

- [x] **Fullscreen button** next to "?", with the shortcut `F`. Esc or the button leaves fullscreen, and
  the icon switches between enter and exit. It uses feature detection, so it is hidden where the
  browser can't do it (the iPhone). It always starts off. On iPad, Safari's own close X covered the
  logo, so in touch fullscreen the top bar now starts 64 px further right (#85).
- [x] **Installable app.** It has a web manifest (`display: "fullscreen"`), icons and a theme
  colour. There is no service worker, so there is no offline mode yet (backlog).
- [x] **iPhone hint:** "Tip: add Durar to your Home Screen for full screen." It shows once, on the second
  visit so it never covers the first "How it works", and it can be closed. It never shows in the
  installed app.
- [x] **Checked on devices by Lativ (14–15 Nov):** fullscreen on a computer and on Android, and the
  iPhone home-screen app opening without Safari's bars.

## D. Anatomy polish (PRs #80, #82, #85 and #86)

- [x] **Hint wording:** "Tap a letter to see its four shapes" on touch screens, and "Click a letter…"
  with a mouse, picked automatically.
- [x] **Teaching animation.** It plays the first 3 times Letters opens, and never again after a letter
  is tapped. A **peek** shows the rightmost letter lifting while its standalone shape fades in beside
  it, and a **glint** runs right to left across the letters. With a mouse, letters lift and glow on
  **hover**. With **reduced motion** nothing moves, and the letters get a faint dotted underline
  instead. Each letter is a real button, read as, for example, "lām. Show its four shapes." The device
  remembers how often the animation played, and the Privacy page says so.
- [x] **The glint repeats (#85)** every 9 seconds while Letters shows, but not on Syllables and never
  with reduced motion.
- [x] **Whole-word speaker** in the anatomy panel (#82). `P` works inside the panel.
- [x] **The word on the card can be tapped, and now looks it (#86).** A soft glow swells over the word
  about every 9 seconds until the first tap. On the first visit, a hint shows once: "Tap the word to see
  its letters". Both stop for good after the first tap.

## Phone layout (PR #84, added during the phase)

After the device checks, Lativ found that the main screen was broken on phones (iPhone and Galaxy S25
Ultra). #84 fixed it:

- The card is centred in the space the controls leave free on every screen, and re-measured on rotation,
  when the browser's bars move, and when the text size changes.
- The card's buttons (Listen, Letters, Share, Save) sit in one row below the card. Save looks like a
  pearl in outline.
- The top bar is calmer. On phones, Text-only view, Slow voice and Daily email moved to a Settings group
  in the "?" menu.
- Text is sharp on 3× screens: the focused card's text is drawn again at the screen's real density.

Lativ checked it on the iPhone and the Samsung, along with the iPad fullscreen fix from #85.

## E. Tests

- [x] **Unit:** the audio lookup and the validator (`tests/unit/voice.test.ts`), the
  vowelled-copies-add-only-marks check, the "show the teaching animation?" logic, the word-tap memory
  (`tests/unit/wordTap.test.ts`), and the fullscreen and install-hint feature detection.
- [x] **Browser:** the speakers by mouse, keyboard and touch, slow mode, the failure state and no
  autoplay (`tests/voice.spec.ts`). Also fullscreen enter and exit, and the button hidden where
  unsupported. The install hint shows once on a simulated iPhone and never in the installed app. The
  anatomy wording on touch and mouse, the peek and glint 3 times then never after a tap, the repeating
  guide, the reduced-motion underline and the panel's speaker (`tests/anatomy.spec.ts`,
  `tests/anatomy-3d.spec.ts`). The phone layout (`tests/layout.spec.ts`), and text-only parity.
- [x] Every PR above passed the full CI suite before it merged.

## Quality bar

- **Accessibility:** every new button has a name and works from the keyboard. Audio never starts on its
  own. The new specs run axe and find no violations. Lighthouse wasn't re-measured this phase.
- **SEO:** the `/word/<slug>` pages keep their markup and only gain the speaker. Not re-measured with
  Lighthouse.
- **Performance:** first paint grew by +0.7 KB gzip (fullscreen and install hint) and +0.4 KB (voice),
  inside the 1.5 KB budget. The audio code and files load lazily. The bundle is 111.4 of 120 KB gzip
  after #86.
- **Privacy:** no new third parties at runtime. The audio comes from `img.durar.space`. The new
  per-device memories (animation count, install hint, word tap, slow voice) are named on the Privacy
  page.
- **RTL:** the new Arabic text (letter names, the panel) reads right to left, and the glint and the
  reading guide run right to left.

## Your steps (all done)

1. Merge #77, the checklist. **Done 13 Nov.**
2. Make the Polly-only key, add the two GitHub secrets, and run the audition. **Done 13 Nov** (the audition
   ran as a re-run of #78's job, because "Run workflow" only shows for workflows already on `main`).
3. Pick the voice: **Zayd** (13 Nov). Listen to the spot-check words (good) and the vowelled sentences
   (approved 14 Nov).
4. Merge #78–#86 and Dependabot #81. **Done 13–15 Nov.**
5. Device checks: fullscreen on a computer and Android, the iPhone home-screen app, the phone layout and
   the iPad close X. **Done 14–15 Nov.**
6. The background music track (#16): deferred. No track has been picked yet, so it moves to the backlog.

## What went wrong

- **The audition steps pointed at a button that wasn't there.** GitHub shows "Run workflow" only for
  workflows on the default branch. Re-running the PR's own run worked, and the steps file was fixed.
- **Sentences without vowel marks were read badly.** The audition asked about this, but the question
  wasn't answered before the full run. It cost one re-record of the sentences (#83, about $0.54).
  Next time, settle such a question before the full run.
- **The phone layout was broken**, and only real devices showed it (#84). The browser tests cover phone
  sizes, but they didn't catch the card being pushed off-centre or the buttons covering its text. The
  layout spec now checks both.
- **Dependabot:** the major group (#76: TypeScript 7, Vite 8, plugin-react 6, @types/node 26) still
  doesn't build, so it was closed. The minor and patch group (#75, then #81) merged.

## Next

- From the backlog: Tide (parked), The Deep in a simpler form, an offline mode for the installed app, a
  background music track (#16), letter-name audio in the anatomy panel, and maybe a human voice for the
  497 headwords. Also email sending at SES's full 50,000 a day, the star and flower pictures (#34) and
  the topic names review, a mobile performance pass, streaks, root-family visuals, a "most shared"
  count and a stricter DMARC.
- Major upgrades (TypeScript 7, Vite 8) when there's time for them.
