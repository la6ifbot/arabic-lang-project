import { useId, type MouseEvent } from 'react';
import { linkHandler } from '../lib/router';
import { closeAbout } from '../state/dialogs';
import { Modal } from './Modal';

/** A footer link that also closes the dialog when it navigates in place. */
const go = (path: string) => (e: MouseEvent) => {
  linkHandler(path)(e);
  if (e.defaultPrevented) closeAbout();
};

/** “What is Durar?”: the same dark-glass sheet as sign-in. */
export default function AboutModal() {
  const titleId = useId();
  const descId = useId();

  return (
    <Modal labelledBy={titleId} describedBy={descId} onClose={closeAbout} className="about-modal">
      <button type="button" className="modal-close" onClick={closeAbout} aria-label="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div className="modal-pearl" aria-hidden="true" />
      <h2 id={titleId} className="modal-title">
        What is Durar?
      </h2>
      <p className="modal-reason">
        <span className="modal-reason-word" lang="ar">
          دُرَر
        </span>{' '}
        means “pearls”
      </p>
      <div className="modal-body">
        <p id={descId} className="modal-text">
          Durar is a quiet place to meet beautiful Arabic words, one at a time. Each word is a pearl drifting in the sea,
          with its full vowel marks, its meaning, its root and a few example sentences.
        </p>
        <p className="modal-text">
          Swipe right on the words you know and they sink into the deep. Swipe left on the ones you’re still learning and
          they stay close. Words you know come back after a few days, then after longer and longer gaps, so they stay with
          you.
        </p>
        <p className="modal-text">
          It’s free, and you don’t need an account. Sign in only if you want to save pearls and keep your progress on
          every device.
        </p>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={closeAbout} data-autofocus>
          Start exploring
        </button>
      </div>
      <p className="modal-privacy">
        <a href="/credits" onClick={go('/credits')}>
          Credits
        </a>
        <span aria-hidden="true"> · </span>
        <a href="/privacy" onClick={go('/privacy')}>
          Privacy
        </a>
      </p>
    </Modal>
  );
}
