import { create } from 'zustand';
import { isTopic, TOPIC_BY_ID } from './topics';
import { WORD_BY_SLUG } from './words';

/**
 * Routes: “/”, “/word/<slug>” and “/sea/<topic>” (the sea), “/library”, “/privacy” and “/credits”. Word routes are also
 * prerendered as static HTML at build time (scripts/prerender.mjs) for crawlers and link previews.
 */
export type Route =
  | { name: 'scene' }
  | { name: 'library' }
  | { name: 'privacy' }
  | { name: 'credits' }
  | { name: 'confirm' } // /subscribe/confirm?token=… (link in the confirmation email)
  | { name: 'unsubscribe' }; // /unsubscribe?token=… (link in every email)

const WORD_PATH = /\/word\/([a-z0-9-]+)\/?$/;
const SEA_PATH = /^\/sea\/([a-z-]+)\/?$/;

export function routeFromPath(pathname: string): Route {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/library') return { name: 'library' };
  if (p === '/privacy') return { name: 'privacy' };
  if (p === '/credits') return { name: 'credits' };
  if (p === '/subscribe/confirm') return { name: 'confirm' };
  if (p === '/unsubscribe') return { name: 'unsubscribe' };
  return { name: 'scene' };
}

export function slugFromPath(pathname: string): string | null {
  const m = pathname.match(WORD_PATH);
  return m && WORD_BY_SLUG.has(m[1]) ? m[1] : null;
}

/** The topic a /sea/<topic> address names, or null (the whole sea, or not a sea address). */
export function topicFromPath(pathname: string): string | null {
  const m = pathname.match(SEA_PATH);
  return m && isTopic(m[1]) ? m[1] : null;
}

export function slugFromLocation(): string | null {
  return slugFromPath(window.location.pathname);
}

/** Only touch the URL when served from the site root (not e.g. an embedded preview). */
const canSyncUrl = (() => {
  if (import.meta.env.VITE_EMBEDDED) return false;
  const p = window.location.pathname;
  return p === '/' || p === '/index.html' || /^\/(word|sea|library|privacy|credits|subscribe|unsubscribe)(\/|$)/.test(p);
})();

export const useRoute = create<{ route: Route }>(() => ({ route: routeFromPath(window.location.pathname) }));

type RouteListener = (route: Route, path: string) => void;
const listeners = new Set<RouteListener>();

/** Lets other modules (e.g. the scene store) react to navigation without an import cycle. */
export function onNavigate(cb: RouteListener) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let inApp = false;
/** True once the visitor has moved between views inside the app (not on the first page they opened). */
export const navigatedInApp = () => inApp;

/** In-app navigation (History API when available, in-memory otherwise). */
export function navigate(path: string) {
  inApp = true;
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

/**
 * Keeps the URL and <title> in step with the sea: the focused card's /word/<slug> in the whole sea,
 * and the topic's /sea/<topic> while a topic is chosen (so a reload or a shared link keeps it).
 */
export function syncUrl(slug: string, topic: string | null = null) {
  const word = WORD_BY_SLUG.get(slug);
  if (!word) return;
  const t = topic ? TOPIC_BY_ID.get(topic) : undefined;
  document.title = `${word.ar} (${word.translit}) — ${word.meanings[0]} · ${t ? `${t.name.en} · ` : ''}Durar`;
  if (!canSyncUrl) return;
  const path = t ? `/sea/${t.id}` : `/word/${slug}`;
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
