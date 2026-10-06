import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile, the quiet “are you a person?” check on the subscribe, sign-up, sign-in and
 * password-reset forms. It runs in the background while the form is open (managed mode, shown only
 * when Cloudflare needs a click), and each request spends one token.
 *
 * Without VITE_TURNSTILE_SITE_KEY nothing loads and requests carry no token (local development).
 * CI and previews use Cloudflare's test keys; see docs/OPERATIONS.md.
 */

declare global {
  interface Window {
    /** Test hook: overrides the build-time site key ('' turns the check off). */
    __DURAR_TURNSTILE_SITEKEY__?: string;
    turnstile?: TurnstileApi;
  }
}

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export function turnstileSiteKey(): string {
  if (typeof window !== 'undefined' && typeof window.__DURAR_TURNSTILE_SITEKEY__ === 'string') return window.__DURAR_TURNSTILE_SITEKEY__;
  return import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
}

let loading: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
    s.onerror = () => {
      loading = null; // a later form may try again
      s.remove();
      reject(new Error('turnstile blocked'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Thrown when no token could be had; the form shows TURNSTILE_MESSAGE. */
export class TurnstileError extends Error {}

export const TURNSTILE_MESSAGE =
  'We couldn’t finish the quick check that keeps bots out. Check your connection, reload the page and try again.';

const WAIT_MS = 60_000; // long enough to answer a challenge Cloudflare shows

/**
 * Renders the widget into the returned ref while `active` is set (a new value renders it afresh, for
 * when the ref moves to another element), and returns `getToken()`, which resolves
 * with a fresh token (waiting for one if the check is still running) and then starts the next one.
 * Resolves with null when Turnstile is off.
 */
export function useTurnstile(active: string | boolean = true) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiters = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void }[]>([]);
  const failed = useRef(false);
  const [waiting, setWaiting] = useState(false);
  const siteKey = turnstileSiteKey();

  useEffect(() => {
    if (!siteKey || !active || !ref.current) return;
    let cancelled = false;
    const el = ref.current;
    const fail = () => {
      failed.current = true;
      for (const w of waiters.current.splice(0)) w.reject(new TurnstileError('turnstile failed'));
    };
    loadScript()
      .then((ts) => {
        if (cancelled) return;
        widget.current = ts.render(el, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          size: 'flexible',
          'refresh-expired': 'auto',
          callback: (t: string) => {
            failed.current = false;
            const w = waiters.current.shift();
            if (w) {
              w.resolve(t);
              if (widget.current) ts.reset(widget.current);
            } else token.current = t;
          },
          'expired-callback': () => (token.current = null),
          'error-callback': () => {
            token.current = null;
            fail();
            return true; // handled: Turnstile retries on its own and doesn't log
          },
        });
      })
      .catch(() => !cancelled && fail());
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
      token.current = null;
    };
  }, [siteKey, active]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!siteKey) return null;
    const ready = token.current;
    if (ready) {
      token.current = null;
      if (widget.current) window.turnstile?.reset(widget.current);
      return ready;
    }
    if (failed.current && !widget.current) throw new TurnstileError('turnstile unavailable');
    if (failed.current && widget.current) {
      failed.current = false;
      window.turnstile?.reset(widget.current);
    }
    setWaiting(true);
    try {
      return await new Promise<string>((resolve, reject) => {
        const entry = { resolve, reject };
        waiters.current.push(entry);
        setTimeout(() => {
          const i = waiters.current.indexOf(entry);
          if (i >= 0) {
            waiters.current.splice(i, 1);
            reject(new TurnstileError('turnstile timeout'));
          }
        }, WAIT_MS);
      });
    } finally {
      setWaiting(false);
    }
  }, [siteKey]);

  return { ref, getToken, waiting, enabled: !!siteKey };
}
