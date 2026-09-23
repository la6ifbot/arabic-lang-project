/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set by the single-file preview build: the app is embedded, so it leaves the URL alone. */
  readonly VITE_EMBEDDED?: string;
}
