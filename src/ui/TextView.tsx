import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../account/store';
import { WORD_BY_SLUG } from '../lib/words';
import { progressLabel, useProgress } from '../state/progress';
import { openAnatomy } from '../state/dialogs';
import { noteWordTap } from '../lib/wordTap';
import { gesture, setMaxZoom, setPan, useDurar, ZOOM_FIT } from '../state/store';
import { useSwipeInput } from '../scene/useSwipeInput';
import { CardActions } from './CardActions';
import { PearlLabel } from './PearlLabel';
import { WordDetails } from './WordDetails';
import { useAnimationFrame } from './useAnimationFrame';

/**
 * The quiet, non-3D version: used when WebGL is unavailable, and on request as an accessible,
 * low-power mode. Same data, same gestures, same keyboard controls.
 */
export function TextView({ notice, onFirstSwipe }: { notice?: string; onFirstSwipe: () => void }) {
  const slug = useDurar((s) => s.order[0]);
  const turn = useDurar((s) => s.turn);
  const known = useDurar((s) => s.known);
  const word = WORD_BY_SLUG.get(slug)!;
  const label = useProgress((s) => progressLabel(s.map[slug]));
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  useSwipeInput(wrap, onFirstSwipe);

  // The card that just left, for a moment: it slides off the side it was swiped to (next, previous),
  // or rises and fades (“I know it”), as the 3D cards do.
  const [ghost, setGhost] = useState<{ slug: string; at: number; kind: 'next' | 'previous' | 'know' } | null>(null);
  // Only for what just happened: switching to this view later doesn't replay an old turn.
  useEffect(() => {
    if (turn && performance.now() - turn.at < 500) setGhost({ slug: turn.slug, at: turn.at, kind: turn.dir > 0 ? 'next' : 'previous' });
  }, [turn]);
  useEffect(() => {
    if (known && Date.now() - known.at < 500) setGhost({ slug: known.slug, at: known.at, kind: 'know' });
  }, [known]);
  useEffect(() => {
    if (!ghost) return;
    const id = window.setTimeout(() => setGhost(null), 900);
    return () => window.clearTimeout(id);
  }, [ghost]);
  const ghostWord = ghost && ghost.slug !== slug ? WORD_BY_SLUG.get(ghost.slug) : undefined;

  // The same “saved” glint as the 3D card, as a light running around the rim.
  const glint = useAccount((st) => (st.glint?.slug === slug ? st.glint.at : null));
  const [glinting, setGlinting] = useState(false);
  useEffect(() => {
    if (glint === null) return;
    setGlinting(true);
    const id = window.setTimeout(() => setGlinting(false), 1200);
    return () => window.clearTimeout(id);
  }, [glint]);

  // Card follows the finger/mouse while dragging, and grows with a pinch.
  useAnimationFrame(() => {
    const el = card.current;
    if (!el) return;
    const dx = gesture.dragPx;
    const dy = gesture.dragPy;
    // Zoom only as far as the card's text still fits across the screen.
    const cs = getComputedStyle(el);
    const text = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    setMaxZoom((window.innerWidth * ZOOM_FIT) / Math.max(text, 1));
    const z = gesture.zoom;
    const maxPan = ((z - 1) * el.offsetHeight) / 2;
    setPan(Math.max(-maxPan, Math.min(maxPan, gesture.panPx)));
    const transform =
      (dx ? `translateX(${dx}px) rotate(${dx * 0.02}deg)` : '') +
      (dy ? ` translateY(${dy}px)` : '') +
      (z !== 1 ? ` translateY(${gesture.panPx}px) scale(${z})` : '');
    if (el.style.transform !== transform.trim()) el.style.transform = transform.trim();
  });

  return (
    <div ref={wrap} className="textview" data-testid="text-view">
      {notice && (
        <p className="textview-notice" role="status">
          {notice}
        </p>
      )}
      <PearlLabel className="potd-inline" />
      {ghostWord && (
        <article key={ghost!.at} className="html-card html-card-ghost" data-kind={ghost!.kind} aria-hidden="true" inert data-testid="leaving-card">
          <WordDetails word={ghostWord} />
        </article>
      )}
      <article ref={card} key={slug} className="html-card" data-testid="html-card" data-glint={glinting || undefined}>
        <CardActions slug={slug} className="card-actions-in-card" />
        <WordDetails word={word} onHeadword={() => {
            noteWordTap();
            openAnatomy(slug);
          }} speakers />
        {label && (
          <p className="card-depth" data-testid="card-depth">
            {label}
          </p>
        )}
      </article>
    </div>
  );
}
