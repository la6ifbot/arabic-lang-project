import { accountsMode } from '../account/backend';
import { useDurar } from '../state/store';

export function SwipeControls({ showHint, onUse }: { showHint: boolean; onUse: () => void }) {
  const swipe = useDurar((s) => s.swipe);
  return (
    <div className="controls">
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
      </button>
      <p className="hint" data-hidden={!showHint || undefined} aria-hidden="true">
        drag · swipe · ← →{accountsMode !== 'off' && <span className="hint-save"> · S to save</span>}
      </p>
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
      </button>
    </div>
  );
}
