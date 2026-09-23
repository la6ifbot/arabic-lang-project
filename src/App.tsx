import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { accountsMode } from './account/backend';
import { bootAccounts, toggleSave, useAccount } from './account/store';
import { hasAuthCallback } from './account/urlState';
import { configureTextureSize } from './lib/cardTexture';
import { mayHaveWebGL2, pickQuality, prefersReducedMotion } from './lib/device';
import { loadCardFonts } from './lib/fonts';
import { linkHandler, syncUrl, useRoute } from './lib/router';
import { saveAnchor } from './state/anchors';
import { useDurar } from './state/store';
import { AccountMenu } from './ui/AccountMenu';
import { Announcer } from './ui/Announcer';
import { SaveButton } from './ui/SaveButton';
import { SearchBar } from './ui/SearchBar';
import { StatusAnnouncer } from './ui/StatusAnnouncer';
import { SwipeControls } from './ui/SwipeControls';
import { TextView } from './ui/TextView';

// three.js + r3f load in their own chunk so the chrome, text and SEO copy paint immediately.
const Experience = lazy(() => import('./scene/Experience').then((m) => ({ default: m.Experience })));
// Pages and dialogs that most visits never open are their own small chunks too.
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const AuthModal = lazy(() => import('./ui/AuthModal'));
const DeleteAccountDialog = lazy(() => import('./ui/DeleteAccountDialog'));

class SceneBoundary extends Component<{ fallback: ReactNode; onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('Durar: 3D scene unavailable, using the text-only view.', error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const NO_WEBGL = 'Your browser can’t show the 3D sea right now, so here is the quiet, text-only version.';

const whenIdle = (fn: () => void): number =>
  typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 2500 }) : window.setTimeout(fn, 400);
const cancelIdle = (id: number) =>
  typeof window.cancelIdleCallback === 'function' ? window.cancelIdleCallback(id) : window.clearTimeout(id);

export function App() {
  const route = useRoute((s) => s.route);
  const authOpen = useAccount((s) => s.auth !== null);
  const confirmDelete = useAccount((s) => s.confirmDelete);

  // Auth redirects (email links, Google) must be handled right away, wherever they land.
  useEffect(() => {
    if (hasAuthCallback() || route.name !== 'scene') void bootAccounts();
  }, [route.name]);

  useEffect(() => {
    if (route.name === 'library') document.title = 'My Pearls · Durar';
    else if (route.name === 'privacy') document.title = 'Privacy · Durar';
  }, [route.name]);

  return (
    <>
      {route.name === 'scene' ? (
        <Sea />
      ) : (
        <Suspense fallback={<div className="page-loading" aria-hidden="true" />}>
          {route.name === 'library' ? <LibraryPage /> : <PrivacyPage />}
        </Suspense>
      )}
      <StatusAnnouncer />
      <Suspense fallback={null}>
        {authOpen && <AuthModal />}
        {confirmDelete && <DeleteAccountDialog />}
      </Suspense>
    </>
  );
}

/** The main, full-screen sea of pearls. */
function Sea() {
  const webgl = useMemo(mayHaveWebGL2, []);
  const reducedMotion = useMemo(prefersReducedMotion, []);
  const quality = useMemo(pickQuality, []);
  const [fontsReady, setFontsReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [lost, setLost] = useState(false);
  const [touched, setTouched] = useState(false);
  const textMode = useDurar((s) => s.textMode);
  const setTextMode = useDurar((s) => s.setTextMode);
  const focused = useDurar((s) => s.order[0]);

  useEffect(() => {
    configureTextureSize(window.innerHeight * 0.74, quality.maxDpr);
    loadCardFonts().then(() => setFontsReady(true));
  }, [quality]);

  useEffect(() => syncUrl(focused), [focused]);

  const use3D = webgl && !lost && !textMode;

  // Accounts load after the scene is up, so they never compete with the first paint.
  useEffect(() => {
    if (accountsMode === 'off' || (use3D && !sceneReady)) return;
    const id = whenIdle(() => void bootAccounts());
    return () => cancelIdle(id);
  }, [use3D, sceneReady]);

  // Keyboard: “/” jumps to search, “S” saves the focused pearl.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (typing || e.altKey || e.ctrlKey || e.metaKey || document.body.dataset.modal) return;
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.search input')?.focus();
      } else if ((e.key === 's' || e.key === 'S') && accountsMode !== 'off') {
        e.preventDefault();
        void toggleSave(useDurar.getState().order[0]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const firstUse = useCallback(() => setTouched(true), []);
  const notice = !webgl || lost ? NO_WEBGL : undefined;
  const textView = <TextView notice={notice ?? (textMode ? undefined : NO_WEBGL)} onFirstSwipe={firstUse} />;

  return (
    <div className="app" data-ready={fontsReady || undefined}>
      <main className="stage">
        {use3D ? (
          fontsReady && (
            <SceneBoundary fallback={textView} onError={() => setLost(true)}>
              <Suspense fallback={null}>
                <Experience
                  quality={quality}
                  reducedMotion={reducedMotion}
                  onFirstSwipe={firstUse}
                  onContextLost={() => setLost(true)}
                  onReady={() => setSceneReady(true)}
                />
              </Suspense>
            </SceneBoundary>
          )
        ) : (
          textView
        )}
        {use3D && (
          <div
            className="save-anchor"
            data-visible="false"
            ref={(el) => {
              saveAnchor.el = el;
            }}
          >
            <SaveButton slug={focused} />
          </div>
        )}
        <Announcer />
      </main>

      <header className="corner-left">
        <a className="brand" href="/" onClick={linkHandler('/')}>
          <span className="brand-ar" lang="ar">
            دُرَر
          </span>
          <span className="brand-en">Durar</span>
        </a>
        <AccountMenu />
      </header>

      <SearchBar />
      <SwipeControls showHint={!touched} onUse={firstUse} />

      {webgl && !lost && (
        <button type="button" className="mode-toggle" onClick={() => setTextMode(!textMode)} aria-pressed={textMode} data-testid="mode-toggle">
          {textMode ? 'Immersive view' : 'Text-only view'}
        </button>
      )}

      {/* Same markup as the static boot screen in index.html, so the hand-off is seamless. */}
      <div className="boot" aria-hidden="true" data-gone={sceneReady || !use3D || undefined}>
        <span className="boot-ar" lang="ar">
          دُرَر
        </span>
        <p className="boot-en">Arabic words, like pearls</p>
      </div>
    </div>
  );
}
