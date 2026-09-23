import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { configureTextureSize } from './lib/cardTexture';
import { mayHaveWebGL2, pickQuality, prefersReducedMotion } from './lib/device';
import { loadCardFonts } from './lib/fonts';
import { syncUrl } from './lib/router';
import { useDurar } from './state/store';
import { Announcer } from './ui/Announcer';
import { SearchBar } from './ui/SearchBar';
import { SwipeControls } from './ui/SwipeControls';
import { TextView } from './ui/TextView';

// three.js + r3f load in their own chunk so the chrome, text and SEO copy paint immediately.
const Experience = lazy(() => import('./scene/Experience').then((m) => ({ default: m.Experience })));

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

  // “/” jumps to search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.search input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const firstUse = useCallback(() => setTouched(true), []);
  const use3D = webgl && !lost && !textMode;
  const notice = !webgl || lost ? NO_WEBGL : undefined;
  const textView = <TextView notice={notice ?? (textMode ? undefined : NO_WEBGL)} onFirstSwipe={firstUse} />;

  return (
    <div className="app" data-ready={fontsReady || undefined}>
      <main className="stage">
        {use3D ? (
          fontsReady && (
            <SceneBoundary fallback={textView} onError={() => setLost(true)}>
              <Suspense fallback={null}>
                <Experience quality={quality} reducedMotion={reducedMotion} onFirstSwipe={firstUse} onContextLost={() => setLost(true)} onReady={() => setSceneReady(true)} />
              </Suspense>
            </SceneBoundary>
          )
        ) : (
          textView
        )}
        <Announcer />
      </main>

      <header className="brand">
        <span className="brand-ar" lang="ar">
          دُرَر
        </span>
        <span className="brand-en">Durar</span>
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
