import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { accountsMode } from './account/backend';
import { bootAccounts, toggleSave, useAccount } from './account/store';
import { hasAuthCallback } from './account/urlState';
import { configureTextureSize } from './lib/cardTexture';
import { mayHaveWebGL2, pickQuality, prefersReducedMotion } from './lib/device';
import { loadCardFonts } from './lib/fonts';
import { cancelIdle, whenIdle } from './lib/idle';
import { linkHandler, syncUrl, useRoute } from './lib/router';
import { saveAnchor } from './state/anchors';
import { loadAnatomy, openAnatomy, useDialogs } from './state/dialogs';
import { startProgress } from './state/progress';
import { useDurar } from './state/store';
import { AccountMenu } from './ui/AccountMenu';
import { CardActions } from './ui/CardActions';
import { HelpBox } from './ui/HelpBox';
import { Announcer } from './ui/Announcer';
import { PearlLabel } from './ui/PearlLabel';
import { ProgressNote } from './ui/ProgressNote';
import { SearchBar } from './ui/SearchBar';
import { StatusAnnouncer } from './ui/StatusAnnouncer';
import { SwipeControls } from './ui/SwipeControls';
import { TextView } from './ui/TextView';
import { TopicPicker } from './ui/TopicPicker';

// three.js + r3f load in their own chunk so the chrome, text and SEO copy paint immediately.
const Experience = lazy(() => import('./scene/Experience').then((m) => ({ default: m.Experience })));
// Pages and dialogs that most visits never open are their own small chunks too.
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const CreditsPage = lazy(() => import('./pages/CreditsPage'));
const EmailLinkPage = lazy(() => import('./pages/EmailLinkPage'));
const SubscribeModal = lazy(() => import('./ui/SubscribeModal'));
const AuthModal = lazy(() => import('./ui/AuthModal'));
const DeleteAccountDialog = lazy(() => import('./ui/DeleteAccountDialog'));
const ResetProgressDialog = lazy(() => import('./ui/ResetProgressDialog'));
const AboutModal = lazy(() => import('./ui/AboutModal'));
const Anatomy = lazy(loadAnatomy);

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

export function App() {
  const route = useRoute((s) => s.route);
  const authOpen = useAccount((s) => s.auth !== null);
  const confirmDelete = useAccount((s) => s.confirmDelete);
  const subscribeOpen = useDialogs((s) => s.subscribe);
  const resetOpen = useDialogs((s) => s.resetProgress);
  const aboutOpen = useDialogs((s) => s.about);
  const anatomyOpen = useDialogs((s) => s.anatomy !== null);

  // Auth redirects (email links, Google) must be handled right away, wherever they land.
  useEffect(() => {
    if (hasAuthCallback() || route.name === 'library' || route.name === 'privacy' || route.name === 'credits') void bootAccounts();
  }, [route.name]);

  useEffect(() => {
    if (route.name === 'library') document.title = 'My Pearls · Durar';
    else if (route.name === 'privacy') document.title = 'Privacy · Durar';
    else if (route.name === 'credits') document.title = 'Credits · Durar';
  }, [route.name]);

  return (
    <>
      {route.name === 'scene' ? (
        <Sea />
      ) : (
        <Suspense fallback={<div className="page-loading" aria-hidden="true" />}>
          {route.name === 'library' ? (
            <LibraryPage />
          ) : route.name === 'privacy' ? (
            <PrivacyPage />
          ) : route.name === 'credits' ? (
            <CreditsPage />
          ) : (
            <EmailLinkPage kind={route.name} />
          )}
        </Suspense>
      )}
      <StatusAnnouncer />
      <Suspense fallback={null}>
        {authOpen && <AuthModal />}
        {confirmDelete && <DeleteAccountDialog />}
        {subscribeOpen && <SubscribeModal />}
        {resetOpen && <ResetProgressDialog />}
        {aboutOpen && <AboutModal />}
        {anatomyOpen && route.name === 'scene' && <Anatomy />}
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

  const topic = useDurar((s) => s.topic);
  useEffect(() => syncUrl(focused, topic), [focused, topic]);

  const use3D = webgl && !lost && !textMode;

  // Accounts and progress load after the scene is up, so they never compete with the first paint.
  useEffect(() => {
    if (use3D && !sceneReady) return;
    const id = whenIdle(() => {
      if (accountsMode !== 'off') void bootAccounts();
      void startProgress();
    });
    return () => cancelIdle(id);
  }, [use3D, sceneReady]);

  // Keyboard: “/” jumps to search, “S” saves the focused pearl, “L” unthreads it into its letters.
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
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        openAnatomy(useDurar.getState().order[0]);
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
            <CardActions slug={focused} />
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
        <HelpBox ready={sceneReady || !use3D} />
      </header>

      {use3D && <PearlLabel />}
      <SearchBar />
      <TopicPicker />
      <ProgressNote />
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
