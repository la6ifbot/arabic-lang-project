// Word and sentence audio (Phase 0.8): Amazon Polly reads every headword and example sentence once,
// and the MP3s go to img.durar.space/audio/<voice>/ under content-hashed names (shared/audio.ts).
//   • `npm run voice -- --upload` (CI, on every pull request and on main) makes only what the host
//     doesn't have yet and uploads it (write-once). A new or changed word costs a few characters.
//   • `npm run voice -- --check` fails if any word or sentence has no audio there.
//   • `npm run voice -- --spot-check` lists the headwords to listen to first (.voice/spot-check.md).
//   • `npm run voice -- --only=durrah,bahr` (with the Polly key set) saves those words' audio to
//     .voice/ to listen to locally.
// To remake one word's audio (a bad take), give it "say": { "take": 2 } in words.json; see docs/CONTENT.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_REGION, VOICE, VOICE_PICKED, wordSpeech } from '../shared/audio.ts';
import { IMAGE_ORIGIN } from '../shared/site.ts';
import { checkOnHost, headOnHost, pool, putOnce, s3 } from './lib/image-host.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.voice');
/** Polly's list prices in USD per million characters (eu-central-1). */
const PRICE_PER_MILLION = { neural: 16, standard: 4 };

/** Every file the site needs: [{ key, ssml, chars, slug, what }]. Shared files (same text) appear once. */
export function speechJobs(words) {
  const seen = new Map();
  for (const w of words) {
    const s = wordSpeech(w);
    const add = (sp, what) => seen.has(sp.key) || seen.set(sp.key, { ...sp, slug: w.slug, what });
    add(s.word, 'word');
    s.examples.forEach((sp, i) => add(sp, `example ${i + 1}`));
  }
  return [...seen.values()];
}

/** What a voice tends to misread in a headword (decision 3), tested on the vowelled spelling. */
const RISKS = [
  ['shadda', /\u0651/],
  ['hamza after the first letter', /[\u0600-\u06FF][\u064B-\u0652]*[ءأإؤئ]/],
  ['al- (sun or moon letter)', /(^|\s)ال/],
  ['tanwīn', /[\u064B-\u064D]/],
  ['madda', /آ/],
  ['alif maqṣūra', /ى/],
  ['two or more words', /\s/],
];

/**
 * The headwords to listen to first: two or more risks, or one of the rarer ones (hamza inside the
 * word, tanwīn, madda, a phrase). Written to the report by `npm run voice -- --spot-check`.
 */
export function spotCheck(words) {
  const rare = new Set(['hamza after the first letter', 'tanwīn', 'madda', 'two or more words']);
  return words
    .map((w) => ({ slug: w.slug, ar: w.ar, translit: w.translit, why: RISKS.filter(([, re]) => re.test(w.ar)).map(([name]) => name) }))
    .filter((r) => r.why.length >= 2 || r.why.some((k) => rare.has(k)));
}

export const cost = (chars, engine = VOICE.engine) => (chars / 1e6) * PRICE_PER_MILLION[engine];

async function polly() {
  const accessKeyId = process.env.POLLY_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.POLLY_AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  const { PollyClient, SynthesizeSpeechCommand } = await import('@aws-sdk/client-polly');
  const client = new PollyClient({ region: AUDIO_REGION, credentials: { accessKeyId, secretAccessKey } });
  return async (ssml) => {
    const r = await client.send(
      new SynthesizeSpeechCommand({
        Engine: VOICE.engine,
        VoiceId: VOICE.name,
        OutputFormat: 'mp3',
        SampleRate: VOICE.engine === 'neural' ? '24000' : '22050',
        TextType: 'ssml',
        Text: ssml,
      }),
    );
    return Buffer.from(await r.AudioStream.transformToByteArray());
  };
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
  const words = JSON.parse(readFileSync(join(ROOT, 'src/data/words.json'), 'utf8'));
  const jobs = speechJobs(only ? words.filter((w) => only.includes(w.slug)) : words);
  const total = jobs.reduce((n, j) => n + j.chars, 0);
  console.log(`voice: ${VOICE.name} (${VOICE.engine}), ${jobs.length} files, ${total} characters (about $${cost(total).toFixed(2)} to make them all).`);

  if (args.includes('--spot-check')) {
    const list = spotCheck(words);
    const urls = new Map(words.map((w) => [w.slug, `${IMAGE_ORIGIN}/${wordSpeech(w).word.key}`]));
    const md = [
      `# Voice spot-check (${list.length} words, ${VOICE.name})`,
      '',
      'Headwords a voice is most likely to misread. Tap **play**, and list any that sound wrong.',
      '',
      '| Word | | Why | Listen |',
      '|---|---|---|---|',
      ...list.map((r) => `| ${r.ar} | ${r.translit} | ${r.why.join(', ')} | [play](${urls.get(r.slug)}) |`),
    ].join('\n');
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'spot-check.md'), md + '\n');
    console.log(`voice: ${list.length} words to spot-check, written to .voice/spot-check.md`);
    return;
  }

  if (!VOICE_PICKED && (args.includes('--check') || args.includes('--upload'))) {
    console.log('voice: the voice is not picked yet (VOICE_PICKED in shared/audio.ts), so CI makes and checks no audio.');
    return;
  }

  if (args.includes('--check')) {
    const { missing, noCors } = await checkOnHost(jobs.map((j) => j.key));
    if (noCors.length) console.warn(`voice: ${noCors.length} file(s) are served without CORS headers (fine for <audio>).`);
    if (missing.length) {
      const byKey = new Map(jobs.map((j) => [j.key, j]));
      console.error(`voice: ${missing.length} file(s) missing on the host, e.g.:`);
      for (const k of missing.slice(0, 10)) console.error(`  ${byKey.get(k).slug} (${byKey.get(k).what}): ${k}`);
      console.error('CI makes them with `npm run voice -- --upload` once the POLLY_AWS_* secrets are set.');
      process.exit(1);
    }
    console.log('voice: every word and sentence has audio.');
    return;
  }

  const synth = await polly();
  if (!synth) {
    console.warn('voice: no Polly key (POLLY_AWS_ACCESS_KEY_ID / POLLY_AWS_SECRET_ACCESS_KEY); nothing made.');
    return;
  }

  if (args.includes('--upload')) {
    const { missing } = await headOnHost(jobs.map((j) => j.key));
    const todo = jobs.filter((j) => missing.includes(j.key));
    const client = await s3();
    let chars = 0;
    await pool(todo, 4, async (j) => {
      await putOnce(client, j.key, await synth(j.ssml), 'audio/mpeg');
      chars += j.chars;
    });
    console.log(`voice: made ${todo.length} file(s), ${chars} characters billed (about $${cost(chars).toFixed(4)}).`);
    return;
  }

  mkdirSync(OUT, { recursive: true });
  for (const j of jobs) writeFileSync(join(OUT, `${j.slug}-${j.what.replace(' ', '')}.mp3`), await synth(j.ssml));
  console.log(`voice: saved ${jobs.length} file(s) to .voice/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
