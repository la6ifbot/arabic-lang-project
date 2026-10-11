import { WORD_BY_SLUG } from '../lib/words';
import { loadAnatomy, openAnatomy } from '../state/dialogs';

/** “Letters”: unthreads the focused word into its letters (also a tap on the headword, or L). */
export function AnatomyButton({ slug }: { slug: string }) {
  const word = WORD_BY_SLUG.get(slug);
  if (!word) return null;
  return (
    <button
      type="button"
      className="anatomy-btn"
      aria-label={`Letters of ${word.ar}`}
      aria-haspopup="dialog"
      aria-keyshortcuts="L"
      title="Letters (L)"
      onClick={() => openAnatomy(slug)}
      onPointerEnter={() => void loadAnatomy()}
      onFocus={() => void loadAnatomy()}
      data-testid="anatomy-button"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle className="anatomy-ring" cx="16" cy="16" r="10.5" />
        <path className="anatomy-thread" d="M8.6 12.2Q16 24.6 23.4 12.2" />
        <circle className="anatomy-bead" cx="11.2" cy="15.9" r="1.7" />
        <circle className="anatomy-bead" cx="16" cy="18.4" r="2.1" />
        <circle className="anatomy-bead" cx="20.8" cy="15.9" r="1.7" />
      </svg>
    </button>
  );
}
