import { useEffect, useState } from 'react';
import { whenIdle } from './idle';

/**
 * First paint's only voice code: it loads the voice chunk (src/ui/Voice.tsx: the player, the speaker
 * buttons and the audio lookup) once the browser is idle, and the buttons appear then.
 */
type VoiceModule = typeof import('../ui/Voice');
let voice: VoiceModule | null = null;
let loading: Promise<VoiceModule> | null = null;

export function loadVoice(): Promise<VoiceModule> {
  loading ??= import('../ui/Voice').then(
    (m) => (voice = m),
    (e: unknown) => {
      loading = null;
      throw e;
    },
  );
  return loading;
}

/** The voice chunk once it's loaded (asks for it when the browser is idle), else null. */
export function useVoiceModule(): VoiceModule | null {
  const [, setReady] = useState(voice !== null);
  useEffect(() => {
    if (voice) return;
    let live = true;
    whenIdle(() => void loadVoice().then(() => live && setReady(true), () => {}));
    return () => {
      live = false;
    };
  }, []);
  return voice;
}

/** Runs `fn` with the voice chunk, loading it first if needed (a key press, a new card). */
export const withVoice = (fn: (m: VoiceModule) => void) => void loadVoice().then(fn, () => {});

/** The voice chunk if it has already loaded (nothing to stop before then). */
export const loadedVoice = () => voice;
