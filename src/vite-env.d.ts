/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set by the single-file preview build: the app is embedded, so it leaves the URL alone. */
  readonly VITE_EMBEDDED?: string;
  /** "mock" runs accounts entirely in the browser (tests, offline previews). */
  readonly VITE_BACKEND?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Human-readable data location for the Privacy page, e.g. "Frankfurt, Germany (EU)". */
  readonly VITE_DATA_REGION?: string;
  readonly VITE_CONTACT_EMAIL?: string;
}

interface Window {
  /** Set by Playwright (or a curious developer) to use the in-browser mock accounts backend. */
  __DURAR_MOCK__?: boolean;
}
