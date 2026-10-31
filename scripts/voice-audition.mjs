// Voice audition: the same 10 words and 3 sentences in each Amazon Polly Arabic voice, so Lativ can
// pick the voice for Durar by ear before any audio is made for the whole site (Phase 0.8, decision 2).
//
//   • `npm run voice:audition -- --upload` (CI) makes whatever samples img.durar.space doesn't have
//     yet, uploads them under audio/audition/v1/, plus a small listening page, and writes the pull
//     request comment to .voice/audition.md;
//   • `npm run voice:audition` (with the Polly key in the environment) saves the samples to .voice/.
//
// The sentences are read twice: once as they appear on the site (no vowel marks, so the voice guesses
// the vowels) and once fully vowelled by hand, to hear whether the example sentences need vowelling.
// Polly bills per character: one full run is under 1,500 characters, about $0.02.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGE_ORIGIN } from '../shared/cards.ts';
import { headOnHost, putOnce, s3 } from './lib/image-host.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.voice');
const PREFIX = 'audio/audition/v1';
const REGION = 'eu-central-1';

/**
 * Every Polly voice that reads Arabic. Hala and Zayd are Gulf Arabic voices that switch to Modern
 * Standard Arabic inside <lang xml:lang="arb">, which is what Durar's words are.
 */
export const VOICES = [
  { id: 'zayd', name: 'Zayd', engine: 'neural', note: 'male, neural (Gulf voice reading Standard Arabic)' },
  { id: 'hala', name: 'Hala', engine: 'neural', note: 'female, neural (Gulf voice reading Standard Arabic)' },
  { id: 'zeina', name: 'Zeina', engine: 'standard', note: 'female, standard (older Standard Arabic voice)' },
];

/** Picked to cover what voices get wrong: shadda, hamza, al- with sun letters, tanwīn, madda, a long phrase. */
const WORD_SLUGS = ['durrah', 'luulu', 'thurayya', 'tumaninah', 'muruah', 'dabaran', 'shira-star', 'nada', 'mirah', 'shaqaiq'];
const SENTENCES = [
  { slug: 'durrah', vowelled: 'هَذِهِ الْقَصِيدَةُ دُرَّةُ الدِّيوَانِ.' },
  { slug: 'tumaninah', vowelled: 'شَعَرْتُ بِالطُّمَأْنِينَةِ حِينَ سَمِعْتُ صَوْتَ أُمِّي.' },
  { slug: 'nada', vowelled: 'لَمَعَ النَّدَى عَلَى أَوْرَاقِ الْوَرْدِ.' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function samples(words) {
  const bySlug = new Map(words.map((w) => [w.slug, w]));
  const get = (slug) => {
    const w = bySlug.get(slug);
    if (!w) throw new Error(`audition word "${slug}" is not in words.json`);
    return w;
  };
  const list = WORD_SLUGS.map((slug, i) => {
    const w = get(slug);
    return { id: `w${String(i + 1).padStart(2, '0')}-${slug}`, text: w.ar, label: `${w.ar} (${w.translit})` };
  });
  SENTENCES.forEach(({ slug, vowelled }, i) => {
    const plain = get(slug).examples[0];
    const n = i + 1;
    list.push({ id: `s${n}-plain`, text: plain.ar, label: `Sentence ${n} as on the site: ${plain.ar}`, en: plain.en });
    list.push({ id: `s${n}-vowelled`, text: vowelled, label: `Sentence ${n} fully vowelled: ${vowelled}`, en: plain.en });
  });
  return list;
}

export const ssml = (text) => `<speak><lang xml:lang="arb">${esc(text)}</lang></speak>`;

async function polly() {
  const accessKeyId = process.env.POLLY_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.POLLY_AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  const { PollyClient, SynthesizeSpeechCommand } = await import('@aws-sdk/client-polly');
  const client = new PollyClient({ region: REGION, credentials: { accessKeyId, secretAccessKey } });
  return async (voice, text) => {
    const r = await client.send(
      new SynthesizeSpeechCommand({
        Engine: voice.engine,
        VoiceId: voice.name,
        OutputFormat: 'mp3',
        SampleRate: voice.engine === 'neural' ? '24000' : '22050',
        TextType: 'ssml',
        Text: ssml(text),
      }),
    );
    return Buffer.from(await r.AudioStream.transformToByteArray());
  };
}

function listeningPage(list) {
  const rows = list
    .map(
      (s) => `<tr><th scope="row"><span lang="ar" dir="rtl">${esc(s.text)}</span>${s.en ? `<small>${esc(s.en)}</small>` : ''}<small>${s.id.includes('vowelled') ? 'fully vowelled' : s.id.includes('plain') ? 'as on the site (no vowel marks)' : ''}</small></th>${VOICES.map(
        (v) => `<td><audio controls preload="none" src="${v.id}/${s.id}.mp3" aria-label="${v.name}: ${esc(s.id)}"></audio></td>`,
      ).join('')}</tr>`,
    )
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Durar voice audition</title><style>
body{font:16px/1.5 system-ui,sans-serif;margin:16px;background:#031520;color:#f4efe3}
table{border-collapse:collapse;width:100%}th,td{padding:8px;border-bottom:1px solid #1d3b48;vertical-align:middle;text-align:start}
th span{font:600 1.5em/1.6 "Noto Naskh Arabic",serif;display:block}small{display:block;opacity:.7}audio{width:100%;min-width:160px}
.wrap{overflow-x:auto}
</style></head><body><h1>Durar voice audition</h1>
<p>Listen to each column and pick the voice that sounds best. ${VOICES.map((v) => `<b>${v.name}</b>: ${v.note}.`).join(' ')}</p>
<div class="wrap"><table><thead><tr><th scope="col">Text</th>${VOICES.map((v) => `<th scope="col">${v.name}</th>`).join('')}</tr></thead><tbody>
${rows}
</tbody></table></div></body></html>`;
}

function comment(list, made, missingKey) {
  const page = `${IMAGE_ORIGIN}/${PREFIX}/index.html`;
  const lines = ['<!-- durar:voice-audition -->', '## Voice audition', ''];
  if (missingKey) {
    lines.push('No samples yet: the `POLLY_AWS_ACCESS_KEY_ID` and `POLLY_AWS_SECRET_ACCESS_KEY` secrets are not set. Once they are, re-run this check and the links appear here.');
    return lines.join('\n');
  }
  lines.push(`**Listening page (plays on the phone):** ${page}`, '');
  lines.push(`| Text | ${VOICES.map((v) => v.name).join(' | ')} |`, `|---|${VOICES.map(() => '---').join('|')}|`);
  for (const s of list) {
    const label = s.label.replace(/\|/g, '/');
    lines.push(`| ${label} | ${VOICES.map((v) => `[play](${IMAGE_ORIGIN}/${PREFIX}/${v.id}/${s.id}.mp3)`).join(' | ')} |`);
  }
  lines.push('', VOICES.map((v) => `**${v.name}**: ${v.note}.`).join(' '), '', `Made this run: ${made} sample(s). Pick by replying in the Durar thread with the voice's name.`);
  return lines.join('\n');
}

async function main() {
  const upload = process.argv.includes('--upload');
  const words = JSON.parse(readFileSync(join(ROOT, 'src/data/words.json'), 'utf8'));
  const list = samples(words);
  mkdirSync(OUT, { recursive: true });
  const synth = await polly();
  if (!synth) {
    writeFileSync(join(OUT, 'audition.md'), comment(list, 0, true));
    console.log('voice audition: no Polly key (POLLY_AWS_ACCESS_KEY_ID / POLLY_AWS_SECRET_ACCESS_KEY); nothing made.');
    return;
  }
  const jobs = VOICES.flatMap((v) => list.map((s) => ({ v, s, key: `${PREFIX}/${v.id}/${s.id}.mp3` })));
  let todo = jobs;
  let client;
  if (upload) {
    client = await s3();
    const { missing } = await headOnHost(jobs.map((j) => j.key));
    todo = jobs.filter((j) => missing.includes(j.key));
  }
  let chars = 0;
  for (const { v, s, key } of todo) {
    const audio = await synth(v, s.text);
    chars += ssml(s.text).length;
    if (upload) await putOnce(client, key, audio, 'audio/mpeg');
    else {
      mkdirSync(join(OUT, v.id), { recursive: true });
      writeFileSync(join(OUT, v.id, `${s.id}.mp3`), audio);
    }
  }
  const html = listeningPage(list);
  if (upload) {
    // The page is write-once like everything else on the host; v1 never changes after the first run.
    await putOnce(client, `${PREFIX}/index.html`, html, 'text/html; charset=utf-8');
  } else writeFileSync(join(OUT, 'index.html'), html);
  writeFileSync(join(OUT, 'audition.md'), comment(list, todo.length, false));
  console.log(`voice audition: made ${todo.length} of ${jobs.length} samples (${chars} characters billed).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
