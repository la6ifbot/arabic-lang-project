import { useGlosses } from '../lib/fullWord';
import { WORD_BY_SLUG } from '../lib/words';
import { openWords } from '../state/dialogs';

/** “Words”: short meanings for the harder words in the card's sentences (only on cards that have some). */
export function WordsButton({ slug }: { slug: string }) {
  const word = WORD_BY_SLUG.get(slug);
  const glosses = useGlosses(slug);
  if (!word || !glosses.length) return null;
  return (
    <button
      type="button"
      className="anatomy-btn words-btn"
      aria-label="Hard words in the sentence"
      aria-haspopup="dialog"
      aria-keyshortcuts="W"
      title="Hard words (W)"
      onClick={() => openWords(slug)}
      data-testid="words-button"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle className="anatomy-ring" cx="16" cy="16" r="10.5" />
        <path d="M10.5 12.2c2-.9 3.9-.7 5.5.5 1.6-1.2 3.5-1.4 5.5-.5v8.6c-2-.9-3.9-.7-5.5.5-1.6-1.2-3.5-1.4-5.5-.5z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M16 12.7v8.6" fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.7" />
      </svg>
    </button>
  );
}
