/**
 * The hook for pronunciation audio (backlog): when `pronounce.play` is set, the anatomy layer shows
 * a listen control on the word, each syllable and each letter, and calls it with what to say.
 * Nothing sets it yet, so no control shows.
 */
export type SoundTarget =
  | { kind: 'word'; slug: string }
  | { kind: 'syllable'; slug: string; index: number; tr: string }
  | { kind: 'letter'; char: string };

export const pronounce: { play: ((target: SoundTarget) => void) | null } = { play: null };
