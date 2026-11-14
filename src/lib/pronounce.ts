/**
 * The hook for syllable and letter audio (backlog): when `pronounce.play` is set, the anatomy layer
 * shows a listen control on each syllable and each letter, and calls it with what to say. Nothing
 * sets it yet, so no control shows. (The whole word uses the voice's own speaker, src/ui/Voice.tsx.)
 */
export type SoundTarget =
  | { kind: 'syllable'; slug: string; index: number; tr: string }
  | { kind: 'letter'; char: string };

export const pronounce: { play: ((target: SoundTarget) => void) | null } = { play: null };
