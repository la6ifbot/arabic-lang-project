// Every word's audio keys (shared/audio.ts). Import ONLY through loadAudioKeys() (./voice): it is its
// own small chunk, loaded while the browser is idle, never in first paint.
import lookup from '../data/words.json?audio';
import type { WordAudio } from '../types';

/** The keys on img.durar.space for a word's headword and each example, or undefined for an unknown slug. */
export function audioOf(slug: string): WordAudio | undefined {
  const hashes = lookup.words[slug]?.split(' ');
  if (!hashes) return undefined;
  const [word, ...examples] = hashes.map((h) => `${lookup.dir}${h}.mp3`);
  return { word, examples };
}
