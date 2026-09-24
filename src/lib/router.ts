import { create } from 'zustand';
import { WORD_BY_SLUG } from './words';

/**
 * Routes: “/” and “/word/<slug>” (the sea), “/library” and “/privacy”. Word routes are also
 * prerendered as static HTML at build time (scripts/prerender.mjs) for crawlers and link previews.
 */
export type Route =
  | { name: 'scene' }
  | { name: 'library' }
  | { name: 'privacy' }
  | { name: 'confirm' } // /subscribe/confirm?token=… (link in the confirmation email)
  | { name: 'unsubscribe' }; // /unsubscribe?token=… (link in every email)

const WORD_PATH = /\/word\/([a-z0-9-]+)\/?$/;

export function routeFromPath(pathname: string): Route {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/library') return { name: 'library' };
  if (p === '/privacy') return { name: 'privacy' };
  if (p === '/subscribe/confirm') return { name: 'confirm' };
  if (p === '/unsubscribe') return { name: 'unsubscribe' };
  return { name: 'scene' };
}

export function slugFromPath(pathname: string): string | null {
  const m = pathname.match(WORD_PATH);
  return m && WORD_BY_SLUG.has(m[1]) ? m[1] : null;
}

export function slugFromLocation(): string | null {
  return slugFromPath(window.location.pathname);
}

/** Only touch the URL when served from the site root (not e.g. an embedded preview). */
const canSyncUrl = (() => {
  if (import.meta.env.VITE_EMBEDDED) return false;
  const p = window.location.pathname;
  return p === '/' || p === '/index.html' || /^\/(word|library|privacy|subscribe|unsubscribe)(\/|$)/.test(p);
})();

export const useRoute = create<{ route: Route }>(() => ({ route: routeFromPath(window.location.pathname) }));

type RouteListener = (route: Route, path: string) => void;
const listeners = new Set<RouteListener>();

/** Lets other modules (e.g. the scene store) react to navigation without an import cycle. */
export function onNavigate(cb: RouteListener) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** In-app navigation (History API when available, in-memory otherwise). */
export function navigate(path: string) {
  const route = routeFromPath(path);
  if (canSyncUrl) {
    try {
      window.history.pushState(null, '', path);
    } catch {
      /* sandboxed frames */
    }
  }
  useRoute.setState({ route });
  listeners.forEach((l) => l(route, path));
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const route = routeFromPath(window.location.pathname);
    useRoute.setState({ route });
    listeners.forEach((l) => l(route, window.location.pathname));
  });
}

/** Keeps the URL and <title> in step with the focused card while the sea is on screen. */
export function syncUrl(slug: string) {
  const word = WORD_BY_SLUG.get(slug);
  if (!word) return;
  document.title = `${word.ar} (${word.translit}) — ${word.meanings[0]} · Durar`;
  if (!canSyncUrl) return;
  const path = `/word/${slug}`;
  if (window.location.pathname === path) return;
  try {
    window.history.replaceState(window.history.state, '', path + window.location.search);
  } catch {
    /* sandboxed frames may forbid history access */
  }
}

/** Plain links that should navigate inside the app (keeps modifier-clicks opening new tabs). */
export function linkHandler(path: string) {
  return (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(path);
  };
}
