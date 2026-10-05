# Durar content guide

How words reach the site, how to write them, and what may be used. The rules the computer checks
live in `scripts/lib/word-schema.mjs` (`npm run validate:data`); this page is for the people.

## How a word reaches the site

```
Google Sheet ──Run "Import from the Sheet"──▶ pull request (summary + preview) ──Lativ merges──▶ durar.space
```

1. Edit the **Durar words** Google Sheet: add rows, fix cells, mark reviews.
2. On GitHub, open **Actions → Import from the Sheet → Run workflow** (works in the GitHub phone
   app too). Leave **Allow removals** unticked unless you deleted rows on purpose.
3. The workflow downloads the Sheet, checks every row and opens a pull request titled
   *Content: import from the Sheet*. Its description lists new, changed and removed words, words per
   topic, what is still unreviewed, and any warnings. If a row is wrong, nothing is imported and the
   run's summary names the row and the problem: fix it in the Sheet and run it again.
4. The pull request has a preview link. Look at the new cards there, then merge. A merge goes live.

The Sheet is the editing surface; `src/data/words.json` and `src/data/topics.json` in the repo
are what the site is built from. Words sometimes arrive another way (a batch written by Claude as
its own pull request). The import keeps such words: they are listed in its summary under *In the
repo, not in the Sheet yet* and stay on the site, so editing and importing the Sheet is safe at any
time. To bring them into the Sheet, upload the batch's `durar-new-rows-batch-N.csv` (its rows only,
no header) into the `words` tab with **File → Import → Upload → Append to current sheet**, after
that batch's pull request is merged. `node scripts/export-sheet.mjs out --only slug1,slug2` writes such
a file, and `node scripts/export-sheet.mjs` writes the whole current data as CSV at any time.

### Removing a word

Removing a word breaks its `/word/<slug>` link (shared links and search results) and drops it from
everyone's Library. Prefer fixing a word to removing it. The import keeps rows you deleted unless
**Allow removals** is ticked, and the pull request lists each removal again.

Never change a slug: to the site that is a removal plus a new word.

## The Sheet

One spreadsheet, two tabs. Format the whole `ar`, `example_n_ar` and `name_ar` / `description_ar`
columns as right-to-left (**Format → Direction → Right-to-left**) so Arabic reads naturally.

### Tab `words` (one row per word)

| Column | What goes in it | Example |
| --- | --- | --- |
| `slug` | The word's address: lowercase Latin letters, digits and hyphens. Permanent. | `qaws-quzah` |
| `ar` | The headword **with its diacritics** (required). | نَجْم |
| `translit` | Transliteration, see the style guide below. | `najm` |
| `meaning_1` … `meaning_3` | Short English meanings, the most common first. At least one. | a star |
| `root` | Root letters separated by spaces (optional). | ن ج م |
| `topics` | Topic ids from the `topics` tab, separated by commas. Empty means the whole sea only. | `sky, poetry` |
| `added` | The date the word joins (YYYY-MM-DD). Leave empty on a new row: the import fills in today. Never change it later: Pearl of the Day depends on it. | 2026-10-03 |
| `status` | `draft` or `reviewed` (native-speaker review). Empty means draft. | reviewed |
| `example_1_ar`, `example_1_en`, `example_1_source` | An example sentence, its translation, and who said it if it is a quotation or proverb. 1 to 3 examples. | |
| `etymology`, `etymology_source` | The word's story, in our own words, and the reference it rests on. **Required** for the *Words the world borrowed* topic. | |
| `image` | An illustration id from the illustrations registry (see `docs/ILLUSTRATIONS.md`). Leave empty for most words. | |
| `notes` | Anything for the reviewers. Never shown on the site. | |

### Tab `topics`

`id`, `order`, `name_en`, `name_ar`, `description_en`, `description_ar`, `cover`. The id is the
topic's address (`/sea/<id>`): don't change it. Every topic should reach 20 words; fewer shows as
a warning, not an error.

## Review status

Every word starts as **draft**. A native speaker reads it (headword, diacritics, meanings, the
Arabic of each example) and sets `status` to **reviewed**. Both show on the site for now. Each
import's summary counts the unreviewed words per topic.

## Style guide

**Tone.** Durar is calm and a little poetic, never cute. Write for a curious adult who loves
language. No exclamation marks, no emoji.

**Headword.** Fully voweled where it matters (at least the vowels a learner could get wrong). The
`ta marbuta` stays (ة). Prefer the singular, the dictionary form.

**Meanings.** Lowercase, no final full stop, a few words each. The common meaning first, then the
figurative one: *"a large, flawless pearl"*, *"something rare and precious; the finest of its
kind"*. One meaning is fine; three is the most.

**Examples.** One sentence each, at most about twelve Arabic words, natural Modern Standard Arabic
that shows the word in a typical setting. One good example beats three. Diacritics in examples are
optional; add them where a reader might stumble. The English is a natural translation, not a gloss.
A quotation or proverb gets a `source` (the poet's name, or *proverb*). Quote classical poetry only
(well out of copyright), and only a line or two.

**Transliteration.** Lowercase, words separated by single spaces:

| Sound | Write | Sound | Write |
| --- | --- | --- | --- |
| long vowels | ā ī ū | ʿayn ع | ʿ (U+02BF) |
| ح ص ض ط ظ | ḥ ṣ ḍ ṭ ẓ | hamza ء | ʾ (U+02BE) |
| خ غ ش ث ذ | kh gh sh th dh | ة at the end | ah |
| doubled letter (shadda) | write it twice | the article ال | *al* and a space: *al jabr* |

No apostrophes, no capitals, no hyphens. The validator rejects anything else.

**Etymology.** Two or three plain sentences: the Arabic source word and what it meant, the route it
travelled (often through Medieval Latin, Spanish or Italian), and what it means now. Record the
reference in `etymology_source` (a dictionary entry or a book, with enough detail to find it).

**When to add an image.** Only where a picture adds something a sentence can't: a flower, a star
or constellation, a creature, an instrument. Not for feelings or abstract words. The style is fine
ink or engraving line art (decision 5); the pipeline restyles it to the water palette.

## Licensing (decision 8)

- **Original writing only.** Meanings, examples and etymologies are written fresh for Durar.
  Dictionaries and lexicons (Lane, Hans Wehr, Lisān al-ʿArab, the OED, Wiktionary…) are references
  to check against, never text to copy, even with a credit. Some, like Wiktionary (CC BY-SA), would
  force their licence on the whole site.
- **Every etymology and every star-name claim records its source** in `etymology_source`.
- **Quotations** are limited to classical Arabic poetry and proverbs, attributed in the example's
  `source`.
- **Images** are public-domain or CC0 only, from the illustrations registry, each with its credit
  and licence; the Credits page lists them all. No photos.
- **Music** is credited on the Credits page as well.
