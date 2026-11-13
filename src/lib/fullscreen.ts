// Fullscreen and installed-app checks. Feature detection only, never device sniffing: an iPhone
// reports no fullscreen support (Safari allows it only for video), so the button simply isn't shown.

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/** True where the page may go fullscreen (desktop, Android, iPad), false on iPhone. */
export function canFullscreen(doc: Document = document): boolean {
  const d = doc as WebkitDocument;
  return Boolean(d.fullscreenEnabled ?? d.webkitFullscreenEnabled);
}

/** The fullscreen button (and F): where allowed, except inside the installed app, already full screen. */
export function offersFullscreen(win: Window = window): boolean {
  return canFullscreen(win.document) && !win.matchMedia?.('(display-mode: fullscreen)').matches;
}

export function isFullscreen(doc: Document = document): boolean {
  const d = doc as WebkitDocument;
  return Boolean(d.fullscreenElement ?? d.webkitFullscreenElement);
}

/** Enters or leaves fullscreen. Errors (a browser saying no) leave things as they are. */
export async function toggleFullscreen(doc: Document = document): Promise<void> {
  const d = doc as WebkitDocument;
  try {
    if (isFullscreen(d)) await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
    else {
      const el = d.documentElement as WebkitElement;
      await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.());
    }
  } catch {
    /* refused, e.g. not from a user gesture */
  }
}

export const FULLSCREEN_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;

/** Running as an installed app (Home Screen on iPhone, or an installed web app elsewhere). */
export function isInstalledApp(win: Window = window): boolean {
  if ((win.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return ['standalone', 'fullscreen', 'minimal-ui'].some((m) => win.matchMedia?.(`(display-mode: ${m})`).matches);
}

/**
 * The “add Durar to your Home Screen” tip: only where the page can't go fullscreen but can be added to
 * the Home Screen as a full-screen app. `navigator.standalone` exists only in Safari on iOS.
 */
export function wantsInstallHint(win: Window = window): boolean {
  return 'standalone' in win.navigator && !isInstalledApp(win) && !canFullscreen(win.document);
}

/**
 * Show the tip on this visit? At most once per device (it is marked seen as soon as it shows), and
 * only for a returning visitor, so it never competes with the first visit's “How it works”.
 */
export function takeInstallHint(win: Window, seenKey: string, helpSeenAtStart: boolean): boolean {
  if (!helpSeenAtStart || !wantsInstallHint(win)) return false;
  try {
    if (win.localStorage.getItem(seenKey) !== null) return false;
    win.localStorage.setItem(seenKey, '1');
    return true;
  } catch {
    return false; // storage blocked: better never than on every visit
  }
}
