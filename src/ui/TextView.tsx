import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../account/store';
import { WORD_BY_SLUG } from '../lib/words';
import { progressLabel, useProgress } from '../state/progress';
import { gesture, useDurar } from '../state/store';
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
  const learning = useDurar((s) => s.learning);
  const word = WORD_BY_SLUG.get(slug)!;
  const label = useProgress((s) => progressLabel(s.map[slug]));
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  useSwipeInput(wrap, onFirstSwipe);

  // “Still learning”: the previous word lingers beside the new one for a moment, then fades.
  const [ghost, setGhost] = useState<{ slug: string; at: number } | null>(null);
  useEffect(() => {
    if (!learning) return;
    setGhost(learning);
    const id = window.setTimeout(() => setGhost(null), 3400);
    return () => window.clearTimeout(id);
  }, [learning]);
  const ghostWord = ghost ? WORD_BY_SLUG.get(ghost.slug) : undefined;

  // The same “saved” glint as the 3D card, as a light running around the rim.
  const glint = useAccount((st) => (st.glint?.slug === slug ? st.glint.at : null));
  const [glinting, setGlinting] = useState(false);
  useEffect(() => {
    if (glint === null) return;
    setGlinting(true);
    const id = window.setTimeout(() => setGlinting(false), 1200);
    return () => window.clearTimeout(id);
  }, [glint]);

  // Card follows the finger/mouse while dragging.
  useAnimationFrame(() => {
    const el = card.current;
    if (!el) return;
    const dx = gesture.dragPx;
    el.style.transform = dx ? `translateX(${dx}px) rotate(${dx * 0.02}deg)` : '';
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
        <article key={ghost!.at} className="html-card html-card-ghost" aria-hidden="true" inert data-testid="linger-card">
          <WordDetails word={ghostWord} />
        </article>
      )}
      <article ref={card} key={slug} className="html-card" data-testid="html-card" data-glint={glinting || undefined}>
        <CardActions slug={slug} className="card-actions-in-card" />
        <WordDetails word={word} />
        {label && (
          <p className="card-depth" data-testid="card-depth">
            {label}
          </p>
        )}
      </article>
    </div>
  );
}
