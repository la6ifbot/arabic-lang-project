import type { Word } from '../types';

/** Semantic HTML rendering of a card — used for screen readers and the text-only view. */
export function WordDetails({ word, headingLevel = 2 }: { word: Word; headingLevel?: 1 | 2 }) {
  const H = `h${headingLevel}` as const;
  return (
    <>
      <p className="wd-tr">{word.translit}</p>
      <H className="wd-ar" lang="ar" dir="rtl">
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
