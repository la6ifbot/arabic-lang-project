import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../account/store';
import { WORD_BY_SLUG } from '../lib/words';
import { gesture, useDurar } from '../state/store';
import { useSwipeInput } from '../scene/useSwipeInput';
import { SaveButton } from './SaveButton';
import { WordDetails } from './WordDetails';
import { useAnimationFrame } from './useAnimationFrame';

/**
 * The quiet, non-3D version: used when WebGL is unavailable, and on request as an accessible,
 * low-power mode. Same data, same gestures, same keyboard controls.
 */
export function TextView({ notice, onFirstSwipe }: { notice?: string; onFirstSwipe: () => void }) {
  const slug = useDurar((s) => s.order[0]);
  const word = WORD_BY_SLUG.get(slug)!;
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  useSwipeInput(wrap, onFirstSwipe);

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
      <article ref={card} key={slug} className="html-card" data-testid="html-card" data-glint={glinting || undefined}>
        <SaveButton slug={slug} className="save-in-card" />
        <WordDetails word={word} />
      </article>
    </div>
  );
}
