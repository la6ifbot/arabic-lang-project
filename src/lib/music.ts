import { create } from 'zustand';

/** The background track. Swap the file in public/audio/ to change the music. */
export const MUSIC_SRC = '/audio/background.mp3';
const KEY = 'durar:music';
const INVITED_KEY = 'durar:music-invited';
const VOLUME = 0.5;

type Music = {
  /** Sound is actually coming out right now. */
  playing: boolean;
  /** The file couldn't load, so the button hides itself. */
  failed: boolean;
  /** First visit, no choice made yet: the speaker button pulses once to invite a tap. */
  invite: boolean;
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice just lasts for this visit */
  }
}

export const useMusic = create<Music>(() => ({
  playing: false,
  failed: false,
  invite: typeof window !== 'undefined' && read(KEY) === null && read(INVITED_KEY) === null,
}));

/** The pulse has played: don't invite again on later visits. */
export function invited() {
  write(INVITED_KEY, '1');
  useMusic.setState({ invite: false });
}

let audio: HTMLAudioElement | null = null;
let fade = 0;

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

function element(): HTMLAudioElement {
  if (audio) return audio;
  // Safari: “ambient” sound obeys the phone's silent switch and mixes with whatever else is playing.
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (session) session.type = 'ambient';
  // Created on first play, so the file is only fetched once someone asks for music.
  audio = new Audio(MUSIC_SRC);
  audio.loop = true;
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

/** The speaker button: turns the music on or off, and remembers the choice. */
export function toggleMusic() {
  if (useMusic.getState().invite) invited();
  if (audio && !audio.paused) {
    write(KEY, 'off');
    pause();
  } else {
    write(KEY, 'on');
    play();
  }
}

// Someone who turned the music on before gets it back at their first tap, click or key press this
// visit (browsers allow sound only after an interaction). The button handles its own clicks.
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;

function onGesture(e: Event) {
  if (e.target instanceof Element && e.target.closest('[data-music-toggle]')) return;
  if (read(KEY) === 'on') play();
}

function stopListening() {
  for (const g of GESTURES) window.removeEventListener(g, onGesture, true);
}

let started = false;

/** Called once at boot. Music is off unless the visitor has asked for it; it pauses in background tabs. */
export function startMusic() {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (read(KEY) === 'on') {
    for (const g of GESTURES) window.addEventListener(g, onGesture, { capture: true, passive: true });
  }
  let resume = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resume = !!audio && !audio.paused;
      pause();
    } else if (resume) {
      resume = false;
      play();
    }
  });
}
