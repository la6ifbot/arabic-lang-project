import { useRef } from 'react';
import type { Word } from '../types';

/**
 * Semantic HTML rendering of a card — used for screen readers and the text-only view.
 * `onHeadword`: a tap on the headword (not the end of a swipe) calls it; keyboard users have the
 * Letters button and L.
 */
export function WordDetails({ word, headingLevel = 2, onHeadword }: { word: Word; headingLevel?: 1 | 2; onHeadword?: () => void }) {
  const H = `h${headingLevel}` as const;
  const down = useRef<{ x: number; y: number } | null>(null);
  return (
    <>
      <p className="wd-tr">{word.translit}</p>
      <H
        className="wd-ar"
        lang="ar"
        dir="rtl"
        data-tappable={onHeadword ? true : undefined}
        onPointerDown={onHeadword && ((e) => (down.current = { x: e.clientX, y: e.clientY }))}
        onClick={
          onHeadword &&
          ((e) => {
            const d = down.current;
            if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) onHeadword();
          })
        }
      >
        {word.ar}
      </H>
      <div className="wd-rule" aria-hidden="true" />
      <p className="wd-meaning">{word.meanings[0]}</p>
      {word.meanings.length > 1 && <p className="wd-meaning2">{word.meanings.slice(1).join('; ')}</p>}
      <ul className="wd-examples" aria-label="Examples">
        {word.examples.map((ex, i) => (
          <li key={i}>
            <p className="wd-ex-ar" lang="ar" dir="rtl">
              {ex.ar}
            </p>
            <p className="wd-ex-en">{ex.en}</p>
            {ex.source && <p className="wd-ex-src">— {ex.source}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}
