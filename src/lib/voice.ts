import { create } from 'zustand';
import { IMAGE_ORIGIN } from '../../shared/site';
import { audioOf } from './audioKeys';

/**
 * Lives in the voice chunk (src/ui/Voice.tsx), which loads while the browser is idle (./voiceLoader).
 * Plays a word's or sentence's audio from img.durar.space (shared/audio.ts makes the files). Never
 * starts on its own: only a speaker button or P / Shift+P calls play(). Slow mode is the same file
 * at 0.75× with the pitch kept. While a voice plays, a `durar:voice` event lets background music dip.
 */
export type VoicePhase = 'idle' | 'loading' | 'playing' | 'failed';

interface VoiceState {
  /** The audio key the phase belongs to. */
  key: string | null;
  phase: VoicePhase;
  slow: boolean;
  /** For the live region: a new id makes the same text speak again. */
  said: { text: string; id: number };
}

const SLOW_KEY = 'durar.voice.slow';
const readSlow = () => {
  try {
    return localStorage.getItem(SLOW_KEY) === '1';
  } catch {
    return false;
  }
};

export const SLOW_RATE = 0.75;
export const useVoice = create<VoiceState>(() => ({ key: null, phase: 'idle', slow: readSlow(), said: { text: '', id: 0 } }));

const say = (text: string) => useVoice.setState((s) => ({ said: { text, id: s.said.id + 1 } }));

export function setSlow(slow: boolean) {
  useVoice.setState({ slow });
  try {
    localStorage.setItem(SLOW_KEY, slow ? '1' : '0');
  } catch {
    /* private mode: the choice lasts for this visit */
  }
}

export const audioUrl = (key: string) => `${IMAGE_ORIGIN}/${key}`;

/** A few recent files stay loaded, so going back to a card plays at once. */
const cache = new Map<string, HTMLAudioElement>();
const CACHE_SIZE = 8;
let current: HTMLAudioElement | null = null;

function element(key: string): HTMLAudioElement {
  let a = cache.get(key);
  if (a && a.error) a = undefined; // a failed load is tried afresh
  if (!a) {
    a = new Audio();
    a.preload = 'auto';
    a.src = audioUrl(key);
    cache.set(key, a);
    for (const [k, old] of cache) {
      if (cache.size <= CACHE_SIZE) break;
      if (old !== current) cache.delete(k);
    }
  }
  return a;
}

const duck = (playing: boolean) => window.dispatchEvent(new CustomEvent('durar:voice', { detail: { playing } }));

export function stop() {
  const a = current;
  if (!a) return;
  current = null;
  a.onplaying = a.onended = a.onerror = null;
  a.pause();
  duck(false);
  useVoice.setState({ phase: 'idle', key: null });
}

/**
 * Plays `key`; `what` names it for the live region ("the word دُرَّة"). Pressing the button that is
 * playing stops it.
 */
export function play(key: string, what: string) {
  const s = useVoice.getState();
  if (s.key === key && (s.phase === 'playing' || s.phase === 'loading')) return stop();
  stop();
  const a = element(key);
  current = a;
  useVoice.setState({ key, phase: 'loading' });
  const failed = () => {
    if (current !== a) return;
    current = null;
    cache.delete(key);
    duck(false);
    useVoice.setState({ key, phase: 'failed' });
    say('Audio unavailable');
  };
  a.onplaying = () => {
    if (current !== a) return;
    useVoice.setState({ key, phase: 'playing' });
    duck(true);
  };
  a.onended = () => {
    if (current !== a) return;
    current = null;
    duck(false);
    useVoice.setState({ key: null, phase: 'idle' });
  };
  a.onerror = failed;
  a.preservesPitch = true;
  a.defaultPlaybackRate = a.playbackRate = s.slow ? SLOW_RATE : 1;
  a.currentTime = 0;
  say(`Playing ${what}${s.slow ? ', slowly' : ''}`);
  a.play().catch(failed);
}

/** Loads the focused card's audio (headword and first sentence), so the first press plays at once. */
export function prefetchWord(slug: string) {
  const a = audioOf(slug);
  if (a) [a.word, ...a.examples.slice(0, 1)].forEach(element);
}

/** P / Shift+P: plays a word's headword or first sentence. */
export function playWord(slug: string, ar: string, sentence: boolean) {
  const a = audioOf(slug);
  const key = sentence ? a?.examples[0] : a?.word;
  if (key) play(key, sentence ? 'the example sentence' : `the word ${ar}`);
}
