import { create } from 'zustand';

/** The background track. Swap the file in public/audio/ to change the music. */
export const MUSIC_SRC = '/audio/background.mp3';
const KEY = 'durar:music';
const VOLUME = 0.5;

type Music = {
  /** Sound is actually coming out right now. */
  playing: boolean;
  /** The file couldn't load, so the button hides itself. */
  failed: boolean;
};

export const useMusic = create<Music>(() => ({ playing: false, failed: false }));

let audio: HTMLAudioElement | null = null;
let fade = 0;

function wanted(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

function remember(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: the choice just lasts for this visit */
  }
}

function element(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio(MUSIC_SRC);
  audio.loop = true;
  audio.preload = 'auto';
  audio.addEventListener('playing', () => useMusic.setState({ playing: true }));
  audio.addEventListener('pause', () => useMusic.setState({ playing: false }));
  audio.addEventListener('error', () => useMusic.setState({ playing: false, failed: true }));
  return audio;
}

/** Starts the track with a short fade-in (phones that ignore volume simply start at full level). */
function play() {
  const a = element();
  if (!a.paused) return;
  a.volume = 0;
  a.play().then(
    () => {
      stopListening();
      clearInterval(fade);
      fade = window.setInterval(() => {
        a.volume = Math.min(VOLUME, a.volume + VOLUME / 30);
        if (a.volume >= VOLUME) clearInterval(fade);
      }, 50);
    },
    () => {
      /* No user gesture yet (or the file failed): the next tap tries again. */
    },
  );
}

function pause() {
  clearInterval(fade);
  audio?.pause();
}

/** The speaker button: turns the music off (remembered), or on again. */
export function toggleMusic() {
  if (audio && !audio.paused) {
    remember(false);
    pause();
  } else {
    remember(true);
    play();
  }
}

// Browsers only allow sound after the visitor interacts, so the first tap, click or key press anywhere
// starts it. The speaker button handles its own clicks, so a first tap there doesn't start and stop it.
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;

function onGesture(e: Event) {
  if (e.target instanceof Element && e.target.closest('[data-music-toggle]')) return;
  if (wanted()) play();
}

function stopListening() {
  for (const g of GESTURES) window.removeEventListener(g, onGesture, true);
}

let started = false;

/** Called once at boot: waits for the first interaction, and pauses while the tab is in the background. */
export function startMusic() {
  if (started || typeof window === 'undefined') return;
  started = true;
  for (const g of GESTURES) window.addEventListener(g, onGesture, { capture: true, passive: true });
  let resume = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resume = !!audio && !audio.paused;
      pause();
    } else if (resume && wanted()) {
      resume = false;
      play();
    }
  });
}
