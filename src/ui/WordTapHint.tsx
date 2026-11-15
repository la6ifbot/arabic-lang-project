import { useEffect, useState } from 'react';
import { hasCoarsePointer } from '../lib/anatomyTeach';
import { noteWordHinted, onWordTap, readWordTap, wordHint } from '../lib/wordTap';
import { wordTap } from '../state/anchors';
import { useDialogs } from '../state/dialogs';

/** How long the first-time hint stays (ms), unless the word is tapped sooner. */
export const HINT_MS = 6000;

/** Free to show: the card has settled, and no dialog or “How it works” box is over the sea. */
const clear = () =>
  wordTap.el?.dataset.visible === 'true' && !document.body.dataset.modal && !document.querySelector('.help-box:not([hidden])');

/**
 * Shows that the focused card's Arabic word can be tapped to see its letters: a soft glow breathes on
 * it now and then, and the first time, a short hint says so for a few seconds. Both stop for good
 * after the first tap on the word (src/lib/wordTap.ts). Pinned over the headword by SaveAnchor.tsx;
 * decorative only (the Letters button and the L key are the accessible way in), so it never takes a
 * tap and is hidden from screen readers. With reduced motion there's no glow, only the hint.
 */
export function WordTapHint() {
  const [state, setState] = useState(readWordTap);
  const [hint, setHint] = useState<'wait' | 'on' | 'done'>(() => (state.hinted ? 'done' : 'wait'));
  const lettersOpen = useDialogs((s) => s.anatomy !== null);

  useEffect(() => onWordTap(() => setState({ tapped: true, hinted: true })), []);

  // The hint waits for a clear view of the card (the first visit opens “How it works” first).
  useEffect(() => {
    if (hint === 'wait') {
      const id = window.setInterval(() => {
        if (!clear()) return;
        noteWordHinted();
        setHint('on');
      }, 500);
      return () => window.clearInterval(id);
    }
    if (hint === 'on') {
      const id = window.setTimeout(() => setHint('done'), HINT_MS);
      return () => window.clearTimeout(id);
    }
  }, [hint]);

  if (state.tapped) return null;
  return (
    <div
      className="word-tap"
      aria-hidden="true"
      data-visible="false"
      data-hidden={lettersOpen || undefined}
      data-testid="word-tap"
      ref={(el) => {
        wordTap.el = el;
      }}
    >
      <span className="word-tap-glow" />
      <span className="word-tap-hint" data-on={hint === 'on' || undefined} data-testid="word-tap-hint">
        {wordHint(hasCoarsePointer())}
      </span>
    </div>
  );
}
