import { expect, test } from 'vitest';
import { canFullscreen, isInstalledApp, offersFullscreen, takeInstallHint, wantsInstallHint } from '../../src/lib/fullscreen';

type Fake = {
  fullscreen?: boolean;
  webkitFullscreen?: boolean;
  standalone?: boolean; // only Safari on iOS has navigator.standalone at all
  displayMode?: 'browser' | 'standalone' | 'fullscreen' | 'minimal-ui';
  storage?: Map<string, string> | 'blocked';
};

function fakeWindow({ fullscreen, webkitFullscreen, standalone, displayMode = 'browser', storage = new Map() }: Fake) {
  const document = { fullscreenEnabled: fullscreen, webkitFullscreenEnabled: webkitFullscreen } as unknown as Document;
  const navigator = (standalone === undefined ? {} : { standalone }) as Navigator;
  const localStorage = {
    getItem: (k: string) => {
      if (storage === 'blocked') throw new Error('blocked');
      return storage.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (storage === 'blocked') throw new Error('blocked');
      storage.set(k, v);
    },
  };
  const matchMedia = (q: string) => ({ matches: q === `(display-mode: ${displayMode})` });
  return { document, navigator, localStorage, matchMedia } as unknown as Window;
}

const desktop = { fullscreen: true };
const android = { fullscreen: true };
const iPad = { fullscreen: true, standalone: false }; // Safari on iPad allows element fullscreen
const iPhone = { fullscreen: false, standalone: false }; // video-only fullscreen: the API reports false
const oldSafari = { webkitFullscreen: true };

test('fullscreen is detected from the API, including the webkit prefix', () => {
  expect(canFullscreen(fakeWindow(desktop).document)).toBe(true);
  expect(canFullscreen(fakeWindow(oldSafari).document)).toBe(true);
  expect(canFullscreen(fakeWindow(iPhone).document)).toBe(false);
  expect(canFullscreen(fakeWindow({}).document)).toBe(false);
});

test('the fullscreen button shows where allowed, but not inside the installed (already full screen) app', () => {
  expect(offersFullscreen(fakeWindow(desktop))).toBe(true);
  expect(offersFullscreen(fakeWindow(iPad))).toBe(true);
  expect(offersFullscreen(fakeWindow(iPhone))).toBe(false);
  expect(offersFullscreen(fakeWindow({ ...android, displayMode: 'fullscreen' }))).toBe(false);
  expect(offersFullscreen(fakeWindow({ ...desktop, displayMode: 'standalone' }))).toBe(true); // a desktop app window
});

test('the installed app is recognised on iPhone and elsewhere', () => {
  expect(isInstalledApp(fakeWindow(iPhone))).toBe(false);
  expect(isInstalledApp(fakeWindow({ ...iPhone, standalone: true }))).toBe(true);
  expect(isInstalledApp(fakeWindow({ ...android, displayMode: 'fullscreen' }))).toBe(true);
  expect(isInstalledApp(fakeWindow({ ...desktop, displayMode: 'standalone' }))).toBe(true);
  expect(isInstalledApp(fakeWindow(desktop))).toBe(false);
});

test('the Home Screen tip is only for iPhone Safari, never in the installed app', () => {
  expect(wantsInstallHint(fakeWindow(iPhone))).toBe(true);
  expect(wantsInstallHint(fakeWindow({ ...iPhone, standalone: true }))).toBe(false);
  expect(wantsInstallHint(fakeWindow({ ...iPhone, displayMode: 'standalone' }))).toBe(false);
  expect(wantsInstallHint(fakeWindow(iPad))).toBe(false); // has the fullscreen button instead
  expect(wantsInstallHint(fakeWindow(desktop))).toBe(false);
  expect(wantsInstallHint(fakeWindow(android))).toBe(false);
});

test('the tip is taken at most once, only by a returning visitor, and never with storage blocked', () => {
  const storage = new Map<string, string>();
  const win = fakeWindow({ ...iPhone, storage });
  expect(takeInstallHint(win, 'k', false)).toBe(false); // first visit: “How it works” has the stage
  expect(storage.size).toBe(0);
  expect(takeInstallHint(win, 'k', true)).toBe(true);
  expect(storage.get('k')).toBe('1');
  expect(takeInstallHint(win, 'k', true)).toBe(false);
  expect(takeInstallHint(fakeWindow({ ...iPhone, storage: 'blocked' }), 'k', true)).toBe(false);
  expect(takeInstallHint(fakeWindow({ ...iPhone, standalone: true }), 'k', true)).toBe(false);
});
