import { useId } from 'react';
import { useFullWord, useGlosses } from '../lib/fullWord';
import { WORD_BY_SLUG } from '../lib/words';
import { closeWords, useDialogs } from '../state/dialogs';
import { Modal } from './Modal';

/** A meaning in English with Arabic in it: each Arabic run is isolated, so brackets stay in place. */
const mixed = (text: string) =>
  text.split(/([\u0600-\u06FF][\u0600-\u06FF\s:]*[\u0600-\u06FF]|[\u0600-\u06FF])/).map((part, i) =>
    i % 2 ? (
      <bdi key={i} lang="ar">
        {part}
      </bdi>
    ) : (
      part
    ),
  );

/**
 * The harder words of the card's example sentences, each with its dictionary form and a short meaning,
 * grouped under the sentence they come from. The meanings follow Hans Wehr's dictionary, or Lane's
 * Lexicon for older, classical words (named on each line).
 */
export default function WordsDialog() {
  const slug = useDialogs((s) => s.words)!;
  const core = WORD_BY_SLUG.get(slug)!;
  const word = useFullWord(core);
  const glosses = useGlosses(slug);
  const titleId = useId();
  const groups = (word.examples ?? []).map((ex, i) => ({ ex, items: glosses.filter((g) => g.ex === i) })).filter((g) => g.items.length);

  return (
    <Modal labelledBy={titleId} onClose={closeWords} className="words-modal">
      <button type="button" className="modal-close" onClick={closeWords} aria-label="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <h2 id={titleId} className="modal-title">
        Hard words
      </h2>
      <div className="modal-body" data-testid="words-dialog">
        {groups.map(({ ex, items }, i) => (
          <section key={i} className="words-group">
            <p className="words-sentence" lang="ar" dir="rtl">
              {ex.ar}
            </p>
            <dl className="words-list">
              {items.map((g) => (
                <div key={g.w} className="words-item">
                  <dt lang="ar" dir="rtl">
                    {g.ar}
                  </dt>
                  <dd>
                    {mixed(g.en)}
                    <span className="words-src"> · {g.src}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={closeWords} data-autofocus>
          Back to the card
        </button>
      </div>
    </Modal>
  );
}
