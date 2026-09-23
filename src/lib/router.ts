import { WORD_BY_SLUG } from './words';

/**
 * Routes: “/” and “/word/<slug>”. Each word route is also prerendered as static HTML at build time
 * (scripts/prerender.mjs) so crawlers and link previews see real content.
 */
const WORD_PATH = /\/word\/([a-z0-9-]+)\/?$/;

export function slugFromLocation(): string | null {
  const m = window.location.pathname.match(WORD_PATH);
  return m && WORD_BY_SLUG.has(m[1]) ? m[1] : null;
}

/** Only rewrite the URL when served from the site root (not e.g. an embedded preview). */
const canSyncUrl = (() => {
  const p = window.location.pathname;
  return p === '/' || p === '/index.html' || /^\/word\//.test(p);
})();

export function syncUrl(slug: string) {
  const word = WORD_BY_SLUG.get(slug);
  if (!word) return;
  document.title = `${word.ar} (${word.translit}) — ${word.meanings[0]} · Durar`;
  if (!canSyncUrl) return;
  const path = `/word/${slug}`;
  if (window.location.pathname === path) return;
  try {
    window.history.replaceState(null, '', path);
  } catch {
    /* sandboxed frames may forbid history access */
  }
}
