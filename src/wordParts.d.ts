// The two halves of src/data/words.json that vite.config.ts (splitWords) serves. Also in tsconfig.node.json,
// since tests reach src/lib/words.ts.
/** Every word without its heavy fields (vite.config.ts, splitWords). Import only from src/lib/words.ts. */
declare module '*/words.json?core' {
  const words: import('./types').WordCore[];
  export default words;
}

/** The heavy word fields by slug (vite.config.ts, splitWords). Import only from src/lib/wordDetails.ts. */
declare module '*/words.json?details' {
  const details: Record<string, Pick<import('./types').Word, import('./types').WordDetailKey>>;
  export default details;
}

/** The audio lookup (vite.config.ts, splitWords; shared/audio.ts). Import only from src/lib/audioKeys.ts. */
declare module '*/words.json?audio' {
  const audio: import('./types').AudioLookup;
  export default audio;
}
