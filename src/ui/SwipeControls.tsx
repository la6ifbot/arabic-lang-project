import { accountsMode } from '../account/backend';
import { useDurar } from '../state/store';

/**
 * The bottom row: ← still learning, → I know this, and between them, first a hint that the card can
 * be swiped, then (once a word has been swiped away) “Back”, which brings the last word back.
 * On phones the arrows are round buttons with a short word under each, so what a swipe means is
 * always written on screen.
 */
export function SwipeControls({ showHint, onUse }: { showHint: boolean; onUse: () => void }) {
  const swipe = useDurar((s) => s.swipe);
  const back = useDurar((s) => s.back);
  const canGoBack = useDurar((s) => s.history.length > 0);
  return (
    <div className="controls" data-testid="swipe-controls">
      <button
        type="button"
        className="ctrl"
        onClick={() => {
          swipe('learning');
          onUse();
        }}
        aria-keyshortcuts="ArrowLeft"
        aria-label="Still learning — keep this word near"
        data-testid="btn-learning"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>still learning</span>
        <small className="ctrl-under" aria-hidden="true">
          learning
        </small>
      </button>
      <div className="controls-mid">
        {canGoBack ? (
          <button
            type="button"
            className="back-btn"
            onClick={back}
            aria-keyshortcuts="Backspace"
            aria-label="Back to the previous word"
            title="Back (Backspace)"
            data-testid="btn-back"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 7 5 11l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.5 11H14a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            back
          </button>
        ) : (
          <p className="hint" data-hidden={!showHint || undefined} aria-hidden="true">
            <span className="hint-arrow">←</span> swipe <span className="hint-arrow">→</span>
            {accountsMode !== 'off' && <span className="hint-save"> · S to save</span>}
          </p>
        )}
      </div>
      <button
        type="button"
        className="ctrl"
        onClick={() => {
          swipe('known');
          onUse();
        }}
        aria-keyshortcuts="ArrowRight"
        aria-label="I know this — let it sink"
        data-testid="btn-known"
      >
        <span>I know this</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <small className="ctrl-under" aria-hidden="true">
          I know this
        </small>
      </button>
    </div>
  );
}
