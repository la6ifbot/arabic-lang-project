import { createHash } from 'node:crypto';
import type { AudioLookup, Say, WordAudio } from '../src/types';

export type { AudioLookup, Say, WordAudio };

/**
 * Word and sentence audio (Phase 0.8, decision 1). Amazon Polly reads each headword and each example
 * sentence once, in CI (scripts/voice.mjs), and the MP3s live on img.durar.space next to the card
 * images. Like the cards, each file's name is a hash of everything that shapes the sound (voice,
 * text, override), so the URL comes from the word's data alone, a changed word gets new audio, and
 * every file can be cached forever. Node-only (build, prerender, scripts): the browser gets the
 * finished keys through the word details chunk (vite.config.ts).
 */

/** The voice Lativ picks by ear in the audition (scripts/voice-audition.mjs). Changing it remakes all audio. */
export const VOICE = { id: 'zayd', name: 'Zayd', engine: 'neural' } as const satisfies Voice;
/**
 * False until Lativ has picked the voice: CI then makes no audio (nothing is paid for in a voice that
 * may not be kept) and doesn't check for it. Set to true with the chosen VOICE.
 */
export const VOICE_PICKED = false;
/** Bump to remake every file under new names (e.g. after changing the SSML below). */
export const AUDIO_VERSION = 1;
export const AUDIO_REGION = 'eu-central-1';

export interface Voice {
  /** Folder on the host: audio/<id>/. */
  id: string;
  /** Polly's VoiceId. */
  name: string;
  engine: 'neural' | 'standard';
}

/** What scripts/voice.mjs has to make, and where it goes. */
export interface Speech {
  /** Object key on the image host, e.g. audio/zayd/1a2b3c4d5e6f.mp3 (48 bits of hash: plenty for a few thousand files). */
  key: string;
  /** What Polly reads (SSML). */
  ssml: string;
  /** Characters Polly bills (the text inside the tags). */
  chars: number;
}

interface Spoken {
  ar: string;
  say?: Say;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The SSML for a headword or sentence. Hala and Zayd are Gulf Arabic voices that read Modern
 * Standard Arabic inside <lang xml:lang="arb">; for Zeina (Standard Arabic already) it changes nothing.
 */
export function speechSsml({ ar, say }: Spoken): { ssml: string; chars: number } {
  const text = say?.ar ?? ar;
  const inner = say?.ipa ? `<phoneme alphabet="ipa" ph="${esc(say.ipa)}">${esc(text)}</phoneme>` : esc(text);
  return { ssml: `<speak><lang xml:lang="arb">${inner}</lang></speak>`, chars: text.length };
}

export function speech(item: Spoken, voice: Voice = VOICE): Speech {
  const { ssml, chars } = speechSsml(item);
  const hash = createHash('sha256')
    .update(JSON.stringify([AUDIO_VERSION, voice.id, voice.engine, ssml, item.say?.take ?? 0]))
    .digest('hex')
    .slice(0, 12);
  return { key: `audio/${voice.id}/${hash}.mp3`, ssml, chars };
}

interface AudioWord extends Spoken {
  examples: Spoken[];
}

export const wordSpeech = (w: AudioWord, voice: Voice = VOICE) => ({ word: speech(w, voice), examples: w.examples.map((ex) => speech(ex, voice)) });

/**
 * What the site gets (words.json?audio): the voice's folder, and per word its hashes, headword first,
 * then each example, space-separated. Compact on purpose: it loads on every visit.
 */
export function audioLookup(words: AudioWord[], voice: Voice = VOICE): AudioLookup {
  const hash = (key: string) => key.slice(key.lastIndexOf('/') + 1, -'.mp3'.length);
  return {
    dir: `audio/${voice.id}/`,
    words: Object.fromEntries(
      words.map((w) => {
        const a = wordAudio(w, voice);
        return [(w as AudioWord & { slug: string }).slug, [a.word, ...a.examples].map(hash).join(' ')];
      }),
    ),
  };
}

/** The keys the site plays for a word. */
export function wordAudio(w: AudioWord, voice: Voice = VOICE): WordAudio {
  const s = wordSpeech(w, voice);
  return { word: s.word.key, examples: s.examples.map((e) => e.key) };
}
