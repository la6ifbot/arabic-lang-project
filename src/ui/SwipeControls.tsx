import { useDurar } from '../state/store';

/**
 * The bottom row (Phase 0.9, decision 6), laid out like the pages of an Arabic book: Next on the
 * left, Previous on the right, and “I know it” between them for anyone who doesn't swipe. Each has
 * its icon and its word on screen (on phones the word sits under a round button).
 */
export function SwipeControls({ onUse }: { onUse: () => void }) {
  const next = useDurar((s) => s.next);
  const previous = useDurar((s) => s.previous);
  const know = useDurar((s) => s.know);
  const canGoBack = useDurar((s) => s.history.length > 0);
  return (
    <div className="controls" data-testid="swipe-controls">
      <button
        type="button"
        className="ctrl"
        onClick={() => {
          next();
          onUse();
        }}
        aria-keyshortcuts="ArrowLeft"
        aria-label="Next word"
        data-testid="btn-next"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Next</span>
        <small className="ctrl-under" aria-hidden="true">
          Next
        </small>
      </button>
      <button
        type="button"
        className="ctrl ctrl-know"
        onClick={() => {
          know();
          onUse();
        }}
        aria-keyshortcuts="ArrowUp"
        aria-label="I know it — let it sink into the deep"
        data-testid="btn-know"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 14.5 12 8.5l6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>I know it</span>
        <small className="ctrl-under" aria-hidden="true">
          I know it
        </small>
      </button>
      <button
        type="button"
        className="ctrl"
        onClick={() => {
          previous();
          onUse();
        }}
        disabled={!canGoBack}
        aria-keyshortcuts="ArrowRight Backspace"
        aria-label="Previous word"
        title="Previous (→ or Backspace)"
        data-testid="btn-previous"
      >
        <span>Previous</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <small className="ctrl-under" aria-hidden="true">
          Previous
        </small>
      </button>
    </div>
  );
}
