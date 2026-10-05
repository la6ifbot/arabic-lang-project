# Phase 0.7 · H: growing the sea to 500 words

The plan for section H of [the Phase 0.7 checklist](PHASE-0.7-CHECKLIST.md) (decision 20). **Lativ approves this list before any writing starts.** Strike or swap any word in the review; the rest are written in eight batches of 25.

## Targets per topic

Each new word has one main topic and sometimes a second one, as today. 28 everyday words (colours, metals and gems, days and times, the house and the town) join the whole sea without a topic, like the 17 that have none today. No new topics.

| Topic | Now | New | After |
| --- | ---: | ---: | ---: |
| Sea & water | 52 | +24 | **76** |
| Sky & stars | 59 | +18 | **77** |
| Flowers & scent | 41 | +35 | **76** |
| Words the world borrowed | 49 | +29 | **78** |
| Desert | 42 | +34 | **76** |
| Feeling & virtue | 49 | +29 | **78** |
| Poetry & language | 45 | +35 | **80** |
| No topic (whole sea only) | 17 | +29 | 46 |
| **Words** | **300** | **+200** | **500** |

## How a batch goes through the pipeline

Least work for Lativ: **each batch is its own pull request from `main` that changes `src/data/words.json`, and the Sheet catches up with one paste-free upload whenever Lativ likes.**

- **Writing.** Claude writes each batch straight into `words.json` (all `draft`, `added` set to the day the PR opens), runs the validator, and opens the PR with the preview link and the uncertain-items list. Merging makes the batch live, as with the import PRs.
- **The Sheet is never overwritten.** This PR changes the import so that words in the repo but not yet in the Sheet are **kept** (listed in the import summary as "In the repo, not in the Sheet yet"), instead of the whole import stopping on unconfirmed removals. So Lativ can keep editing the Sheet and importing at any time during the batches, and their unimported edits are never lost. Only a run with **Allow removals** ticked drops a word.
- **Catching the Sheet up.** Each merged batch comes with a small `durar-new-rows-batch-N.csv` in the project files (just that batch's rows, no header). In the Sheet: **File → Import → Upload → Append to current sheet**. That adds the rows at the bottom and leaves every existing row alone. It can wait: one upload per batch, or all eight at the end. Only upload a batch's file after its PR is merged, or the next import would add the same words a second time in its own PR.
- The import also skips a header row that turns up again in the middle of the Sheet, in case an upload brings one.

## Rules each batch follows

- `docs/CONTENT.md`: original writing, a recorded source for every etymology and star-name claim, examples in natural Modern Standard Arabic, the transliteration style guide.
- Before each PR: a second self-check pass on diacritics, examples and etymologies, and an **uncertain items** list at the top of the PR so the review starts there.
- Once Thread 4's syllabifier is on `main`, each batch passes it, and any word it flags goes on that batch's uncertain list (with a `syllables` override where the answer is clear).
- Card images render and upload through CI as usual; word pages, topic pages and the sitemap update by themselves.

## Near-duplicate check

Checked by script against all 300 words: no slug clashes, no headword that matches an existing one with its vowels, no plurals or variants of existing words. Where a candidate shares a root with an existing word or looks the same without vowels, the meaning is different and the note column says which word. A few are everyday synonyms of a poetic word already in the sea (for example جَمَل next to بَعِير and نَاقَة); they are there because a learner meets them first.

## Candidates

Batch numbers spread every topic across all eight batches, so the topics grow evenly. "Also in" is the second topic.

### Sea & water (21)

| # | Arabic | Transliteration | Meaning | Also in | Batch | Note |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | مَصَبّ | maṣabb | river mouth, estuary |  | 1 | shares a root with ṣabābah (the tender ardor of love), different meaning |
| 2 | خَلِيج | khalīj | gulf, bay |  | 1 |  |
| 3 | مَحَار | maḥār | oysters; pearl oysters |  | 1 | shells that make the pearls |
| 4 | تَيَّار | tayyār | current (of water or air) |  | 1 |  |
| 5 | دَوَّامَة | dawwāmah | whirlpool, eddy |  | 2 | shares a root with dīmah (a gentle, steady, lasting rain), different meaning |
| 6 | جَلِيد | jalīd | ice |  | 2 |  |
| 7 | بُخَار | bukhār | vapour, steam |  | 2 | shares a root with bakhūr (incense), different meaning |
| 8 | سَبِيل | sabīl | a public drinking fountain; a path, a way |  | 3 |  |
| 9 | قَنَاة | qanāh | canal, channel |  | 3 |  |
| 10 | مَاء | māʾ | water |  | 3 | the basic word; only ma-al-ward has it today |
| 11 | شَبَكَة | shabakah | net, fishing net |  | 4 |  |
| 12 | صَيَّاد | ṣayyād | fisherman, hunter |  | 4 |  |
| 13 | طُوفَان | ṭūfān | flood, deluge |  | 4 |  |
| 14 | سِبَاحَة | sibāḥah | swimming |  | 5 |  |
| 15 | حَوْض | ḥawḍ | basin, pool, cistern |  | 5 |  |
| 16 | سَاقِيَة | sāqiyah | water wheel; irrigation channel | Words the world borrowed | 5 | English acequia, via Spanish |
| 17 | نَجْم البَحْر | najm al baḥr | starfish (literally, star of the sea) |  | 6 | new compound; najm and bahr exist alone |
| 18 | قِنْدِيل البَحْر | qindīl al baḥr | jellyfish (literally, lantern of the sea) |  | 6 | new compound; qindil exists alone |
| 19 | سُلَحْفَاة | sulaḥfāh | turtle, tortoise |  | 6 |  |
| 20 | عَذْب | ʿadhb | fresh, sweet (of water) |  | 6 |  |
| 21 | مُحِيط | muḥīṭ | ocean |  | 7 |  |

### Sky & stars (17)

| # | Arabic | Transliteration | Meaning | Also in | Batch | Note |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | أُفُق | ufuq | horizon |  | 1 |  |
| 2 | شَمْس | shams | sun |  | 1 |  |
| 3 | قَمَر | qamar | moon |  | 1 | hilal and badr are its phases |
| 4 | كَوْكَب | kawkab | planet; a bright star |  | 2 |  |
| 5 | شِهَاب | shihāb | shooting star, meteor |  | 2 |  |
| 6 | ثَلْج | thalj | snow |  | 2 |  |
| 7 | بَرَد | barad | hail |  | 2 |  |
| 8 | رِيح | rīḥ | wind |  | 3 | same root as ruh (soul), different meaning |
| 9 | غُرُوب | ghurūb | sunset |  | 3 | same root as ghurbah (exile), different meaning |
| 10 | شُرُوق | shurūq | sunrise |  | 3 |  |
| 11 | كُسُوف | kusūf | eclipse of the sun |  | 4 |  |
| 12 | الزُّهَرَة | al zuharah | Venus, the morning and evening star |  | 4 | same root as zahrah (flower), different meaning |
| 13 | فَلَك | falak | orbit; the turning sphere of the sky |  | 4 |  |
| 14 | قَلْب العَقْرَب | qalb al ʿaqrab | Antares (literally, the heart of the scorpion) |  | 5 | star name: needs a recorded source; shares a root with qalb (heart), different meaning |
| 15 | السِّمَاك الرَّامِح | al simāk al rāmiḥ | Arcturus (literally, the lance-bearing simāk) |  | 5 | star name: needs a recorded source; shares a root with samakah (fish), different meaning |
| 16 | السُّهَا | al suhā | Alcor, the faint star beside Mizar, the old eye test |  | 5 | star name: needs a recorded source |
| 17 | العَيُّوق | al ʿayyūq | Capella, the bright star of the charioteer |  | 6 | star name: needs a recorded source |

### Flowers & scent (30)

| # | Arabic | Transliteration | Meaning | Also in | Batch | Note |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | شَجَرَة | shajarah | tree |  | 1 |  |
| 2 | وَرَقَة | waraqah | leaf; a sheet of paper |  | 1 |  |
| 3 | جِذْر | jidhr | root (of a plant); origin |  | 1 |  |
| 4 | بِذْرَة | bidhrah | seed |  | 2 |  |
| 5 | ثَمَرَة | thamarah | fruit; the fruit of one's work |  | 2 |  |
| 6 | عُشْب | ʿushb | grass, herbs |  | 2 |  |
| 7 | أَرْز | arz | cedar |  | 3 |  |
| 8 | سِنْدِيَان | sindiyān | oak |  | 3 |  |
| 9 | صَفْصَاف | ṣafṣāf | willow |  | 3 |  |
| 10 | سَرْو | sarw | cypress |  | 3 |  |
| 11 | عِنَب | ʿinab | grapes |  | 4 | karmah (the vine) exists |
| 12 | تُفَّاح | tuffāḥ | apples |  | 4 |  |
| 13 | بُرْتُقَال | burtuqāl | orange (the sweet orange) |  | 4 | naranj is the bitter orange |
| 14 | حِنَّاء | ḥinnāʾ | henna | Words the world borrowed | 5 | same root as hanin and hanan, different meaning |
| 15 | نِيلُوفَر | nīlūfar | water lily, lotus | Sea & water, Words the world borrowed | 5 | English nenuphar |
| 16 | نِسْرِين | nisrīn | eglantine, the wild rose |  | 5 |  |
| 17 | جُلَّنَار | jullanār | pomegranate blossom |  | 6 | rumman (the fruit) exists |
| 18 | آس | ās | myrtle |  | 6 |  |
| 19 | بَان | bān | the ben tree, the poets' image of a slender figure | Poetry & language | 6 |  |
| 20 | رَبِيع | rabīʿ | spring (the season) |  | 6 | same root as raba (spring campsite); related but a different word |
| 21 | سُنْبُلَة | sunbulah | ear of grain; Virgo | Sky & stars | 7 |  |
| 22 | عَسَل | ʿasal | honey |  | 7 |  |
| 23 | خَرُّوب | kharrūb | carob | Words the world borrowed | 7 | English carob |
| 24 | قِرْفَة | qirfah | cinnamon |  | 7 |  |
| 25 | سُمَّاق | summāq | sumac | Words the world borrowed | 7 | English sumac |
| 26 | طَرْخُون | ṭarkhūn | tarragon | Words the world borrowed | 8 | English tarragon, via French; route uncertain |
| 27 | إِكْلِيل الجَبَل | iklīl al jabal | rosemary (literally, the crown of the mountain) |  | 8 |  |
| 28 | إِسْبَانَاخ | isbānākh | spinach | Words the world borrowed | 8 | English spinach, Persian via Arabic |
| 29 | لَيْلَك | laylak | lilac | Words the world borrowed | 8 | English lilac, Persian via Arabic |
| 30 | لُبَان | lubān | frankincense | Words the world borrowed | 8 | English olibanum; Arabic link uncertain, check source |

### Words the world borrowed (14)

| # | Arabic | Transliteration | Meaning | Also in | Batch | Note |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | قَصْر | qaṣr | palace, castle |  | 1 | English alcazar, via Spanish |
| 2 | غَرَّافَة | gharrāfah | a jug for drawing water |  | 1 | English carafe, via Italian and French |
| 3 | مَطْرَح | maṭraḥ | a place where something is thrown down; a cushion, a mat |  | 1 | English mattress, via Italian and French |
| 4 | سِكَّة | sikkah | a coin die; a minted coin; a road, a rail |  | 2 | English sequin, via Italian zecchino |
| 5 | غَرْبَلَة | gharbalah | sifting, sieving |  | 2 | English garble |
| 6 | سَفَر | safar | travel, a journey |  | 2 | English safari, via Swahili |
| 7 | شَاش | shāsh | muslin, a fine light cloth |  | 3 | English sash (the band of cloth) |
| 8 | قِسْمَة | qismah | division, a share; one's lot, fate | Feeling & virtue | 3 | English kismet, via Turkish |
| 9 | حُقَّة | ḥuqqah | a small box, a casket |  | 3 | English hookah, via Urdu |
| 10 | قَالِب | qālib | mould, form |  | 4 | English calibre, via Italian and French; route debated; shares a root with qalb (heart), different meaning |
| 11 | بَرْقُوق | barqūq | plums (in older Arabic, apricots) |  | 4 | English apricot, via Spanish and French |
| 12 | فِصْفِصَة | fiṣfiṣah | alfalfa, lucerne |  | 4 | English alfalfa, via Spanish |
| 13 | غَطَّاس | ghaṭṭās | diver; a diving seabird | Sea & water | 4 | English albatross, via Portuguese alcatraz; route uncertain |
| 14 | شَاه مَات | shāh māt | checkmate (literally, the king is helpless) |  | 5 | English checkmate, via Persian, Arabic and French |

### Desert (34)

| # | Arabic | Transliteration | Meaning | Also in | Batch | Note |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | صَبَّار | ṣabbār | cactus; prickly pear | Flowers & scent | 1 | same root as sabr (patience), different meaning |
| 2 | سِدْر | sidr | the lote tree, the Christ's-thorn jujube | Flowers & scent | 1 |  |
| 3 | طَلْح | ṭalḥ | acacia | Flowers & scent | 1 |  |
| 4 | أَرَاك | arāk | the arak tree, whose twigs are used as toothbrushes | Flowers & scent | 2 |  |
| 5 | كَمْأَة | kamʾah | desert truffles | Flowers & scent | 2 |  |
| 6 | جَمَل | jamal | camel |  | 2 | the everyday word; bair and naqah exist; slug avoids jamal (beauty) |
| 7 | فَرَس | faras | horse, mare |  | 3 |  |
| 8 | جَوَاد | jawād | a fine, swift horse; a generous person | Poetry & language | 3 |  |
| 9 | نَعَامَة | naʿāmah | ostrich |  | 3 |  |
| 10 | ضَبُع | ḍabuʿ | hyena |  | 4 |  |
| 11 | يَرْبُوع | yarbūʿ | jerboa | Words the world borrowed | 4 | English jerboa; shares a root with rabʿ (an abode, a spring campsite), different meaning |
| 12 | فَنَك | fanak | fennec, the desert fox | Words the world borrowed | 4 | English fennec |
| 13 | قَطًا | qaṭā | sandgrouse, the poets' bird that always finds water | Poetry & language | 5 |  |
| 14 | حِرْبَاء | ḥirbāʾ | chameleon |  | 5 |  |
| 15 | عِرْق | ʿirq | a great sea of dunes; a vein, a root | Words the world borrowed | 5 | English erg; same root as araq (sweat), different meaning; spelled like ʿaraq without vowels, different word |
| 16 | حَمَادَة | ḥamādah | a stony desert plateau | Words the world borrowed | 5 | English hamada |
| 17 | سَبْخَة | sabkhah | a salt flat |  | 6 | English sabkha |
| 18 | هَبُوب | habūb | a violent dust storm; a blowing wind | Words the world borrowed | 6 | English haboob |
| 19 | خَمَاسِين | khamāsīn | the hot spring wind of Egypt (literally, the fifty days) |  | 6 | English khamsin |
| 20 | دَلَّة | dallah | the long-spouted Arabic coffee pot |  | 6 | same root as dalil (guide), different meaning |
| 21 | فِنْجَان | finjān | a small coffee cup |  | 7 |  |
| 22 | عِقَال | ʿiqāl | the black cord that holds a headscarf; a hobble for a camel |  | 7 |  |
| 23 | عَبَاءَة | ʿabāʾah | a loose cloak, an aba |  | 7 |  |
| 24 | مَجْلِس | majlis | a sitting room for guests; a council |  | 7 |  |
| 25 | نَار | nār | fire |  | 7 | same root as nur (light); related, different word |
| 26 | جَمْر | jamr | embers |  | 8 |  |
| 27 | رَبَابَة | rabābah | the rebab, a bowed desert fiddle | Poetry & language, Words the world borrowed | 8 | English rebec, via French |
| 28 | جَبَل | jabal | mountain |  | 8 |  |
| 29 | كَهْف | kahf | cave |  | 8 |  |
| 30 | طَرِيق | ṭarīq | road, path |  | 8 |  |
| 31 | أَثَر | athar | trace, footprint; a lasting effect | Poetry & language | 8 | shares a root with īthār (putting others before oneself), different meaning |
| 32 | عَطَش | ʿaṭash | thirst | Sea & water | 8 |  |
| 33 | غَضًى | ghaḍā | the ghada tree, whose embers burn long | Poetry & language | 8 |  |
| 34 | رَاعِي | rāʿī | shepherd, herdsman |  | 8 |  |

### Feeling & virtue (28)

| # | Arabic | Transliteration | Meaning | Also in | Batch | Note |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | حُبّ | ḥubb | love |  | 1 |  |
| 2 | فَرَح | faraḥ | joy, gladness |  | 1 |  |
| 3 | حُزْن | ḥuzn | sadness, grief |  | 1 |  |
| 4 | خَوْف | khawf | fear |  | 2 |  |
| 5 | غَضَب | ghaḍab | anger |  | 2 |  |
| 6 | نَدَم | nadam | regret, remorse |  | 2 | same root as nadim (boon companion), different meaning |
| 7 | غَيْرَة | ghayrah | jealousy; protective zeal |  | 3 |  |
| 8 | طُمُوح | ṭumūḥ | ambition, aspiration |  | 3 |  |
| 9 | شَجَاعَة | shajāʿah | courage |  | 3 |  |
| 10 | صِدْق | ṣidq | truthfulness, sincerity |  | 4 |  |
| 11 | أَمَانَة | amānah | trustworthiness; something held in trust |  | 4 |  |
| 12 | تَوَاضُع | tawāḍuʿ | humility |  | 4 |  |
| 13 | عَفْو | ʿafw | forgiveness, pardon |  | 5 |  |
| 14 | شُكْر | shukr | gratitude, thanks |  | 5 |  |
| 15 | صَدَاقَة | ṣadāqah | friendship |  | 5 | same root as sidq; different meaning |
| 16 | وُدّ | wudd | affection, fondness |  | 5 |  |
| 17 | حَيْرَة | ḥayrah | bewilderment, perplexity |  | 6 |  |
| 18 | دَهْشَة | dahshah | astonishment, wonder |  | 6 |  |
| 19 | قَلَق | qalaq | worry, anxiety |  | 6 |  |
| 20 | نَشْوَة | nashwah | elation, the glow of joy |  | 6 |  |
| 21 | حُرِّيَّة | ḥurriyyah | freedom |  | 7 |  |
| 22 | سَلَام | salām | peace; a greeting |  | 7 |  |
| 23 | يَقِين | yaqīn | certainty |  | 7 |  |
| 24 | أُلْفَة | ulfah | familiarity, intimacy |  | 7 |  |
| 25 | وَحْدَة | waḥdah | loneliness; unity |  | 7 |  |
| 26 | هَوًى | hawā | love, passion; desire | Poetry & language | 8 |  |
| 27 | عِتَاب | ʿitāb | gentle reproach between friends | Poetry & language | 8 |  |
| 28 | لَهْفَة | lahfah | eager longing; anxious concern |  | 8 |  |

### Poetry & language (27)

| # | Arabic | Transliteration | Meaning | Also in | Batch | Note |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | نَاي | nāy | the ney, a reed flute |  | 1 |  |
| 2 | قَانُون | qānūn | the qanun (a zither); law |  | 1 |  |
| 3 | إِيقَاع | īqāʿ | rhythm |  | 1 |  |
| 4 | لَحْن | laḥn | melody, tune |  | 2 |  |
| 5 | غِنَاء | ghināʾ | singing, song |  | 2 |  |
| 6 | مَوَّال | mawwāl | the mawwāl, a long sung improvisation of verse |  | 2 |  |
| 7 | مُوَشَّح | muwashshaḥ | the muwashshaḥ, an Andalusian song-poem in stanzas |  | 3 |  |
| 8 | زَجَل | zajal | zajal, strophic poetry in spoken Arabic |  | 3 |  |
| 9 | غَزَل | ghazal | love poetry |  | 3 | same root as ghazal (gazelle), different meaning; slug avoids the clash |
| 10 | هِجَاء | hijāʾ | satire in verse; spelling |  | 4 |  |
| 11 | مَدِيح | madīḥ | praise poetry |  | 4 |  |
| 12 | فَخْر | fakhr | pride; the boast poem |  | 4 |  |
| 13 | صَدْر | ṣadr | chest; the first half of a line of verse |  | 5 |  |
| 14 | عَجُز | ʿajuz | the second half of a line of verse |  | 5 |  |
| 15 | عَرُوض | ʿarūḍ | prosody, the science of metre |  | 5 |  |
| 16 | شَاعِر | shāʿir | poet |  | 5 | same root as shir (poetry), different meaning |
| 17 | سَجْع | sajʿ | rhymed prose |  | 6 |  |
| 18 | اِسْتِعَارَة | istiʿārah | metaphor (literally, borrowing) |  | 6 |  |
| 19 | تَشْبِيه | tashbīh | simile |  | 6 |  |
| 20 | مَعْنًى | maʿnā | meaning |  | 6 |  |
| 21 | جُمْلَة | jumlah | sentence |  | 7 | shares a root with jamāl (beauty), different meaning |
| 22 | نَحْو | naḥw | grammar; towards |  | 7 |  |
| 23 | أُسْطُورَة | usṭūrah | legend, myth |  | 7 |  |
| 24 | رِسَالَة | risālah | letter, message |  | 7 |  |
| 25 | مَكْتَبَة | maktabah | library; bookshop |  | 8 | same root as kitab (book), different meaning |
| 26 | قِرَاءَة | qirāʾah | reading |  | 8 |  |
| 27 | صَوْت | ṣawt | voice, sound |  | 8 |  |

### No topic (whole sea only) (29)

| # | Arabic | Transliteration | Meaning | Also in | Batch | Note |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | ذَهَب | dhahab | gold |  | 1 |  |
| 2 | فِضَّة | fiḍḍah | silver |  | 1 |  |
| 3 | عَقِيق | ʿaqīq | agate, carnelian |  | 1 |  |
| 4 | زَبَرْجَد | zabarjad | peridot, chrysolite |  | 2 |  |
| 5 | كَهْرَمَان | kahramān | amber |  | 2 | anbar (ambergris) is a different thing |
| 6 | أَلْمَاس | almās | diamond |  | 2 |  |
| 7 | أَزْرَق | azraq | blue |  | 3 |  |
| 8 | أَخْضَر | akhḍar | green |  | 3 |  |
| 9 | أَحْمَر | aḥmar | red |  | 3 |  |
| 10 | أَبْيَض | abyaḍ | white |  | 4 |  |
| 11 | أَسْوَد | aswad | black |  | 4 |  |
| 12 | أَصْفَر | aṣfar | yellow |  | 4 | same root as sifr (zero), different meaning |
| 13 | زَمَان | zamān | time, an age |  | 5 |  |
| 14 | صَبَاح | ṣabāḥ | morning |  | 5 |  |
| 15 | مَسَاء | masāʾ | evening |  | 5 |  |
| 16 | غَد | ghad | tomorrow |  | 6 |  |
| 17 | أَمْس | ams | yesterday |  | 6 |  |
| 18 | يَوْم | yawm | day |  | 6 |  |
| 19 | بَاب | bāb | door, gate |  | 6 |  |
| 20 | نَافِذَة | nāfidhah | window |  | 7 |  |
| 21 | شَمْعَة | shamʿah | candle |  | 7 |  |
| 22 | مِفْتَاح | miftāḥ | key |  | 7 |  |
| 23 | سِرّ | sirr | secret |  | 7 |  |
| 24 | هَدِيَّة | hadiyyah | gift |  | 7 |  |
| 25 | رِحْلَة | riḥlah | journey, trip |  | 8 | same root as rahil (departure) and rahhalah (traveller); different meaning |
| 26 | مَدِينَة | madīnah | city |  | 8 |  |
| 27 | سُوق | sūq | market, souk |  | 8 |  |
| 28 | عَالَم | ʿālam | world |  | 8 |  |
| 29 | لَوْن | lawn | colour |  | 8 |  |

## After the last batch: the scale check

A separate PR once all 500 are in (section H): the first-paint bundle size before and after (splitting or lazy-loading the word data if it is bundled), search speed, the number of cards the 3D scene mounts, the anatomy and syllable CI pass over all 500 words, and every place on the site that still says "300".
