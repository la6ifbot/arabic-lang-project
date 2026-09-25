import { useId, useState } from 'react';
import { friendlyMessage } from '../account/errors';
import { announce, useAccount } from '../account/store';
import { closeResetProgress } from '../state/dialogs';
import { resetProgress } from '../state/progress';
import { Modal } from './Modal';

/** “Reset my progress…”: clears every word's box and return date. Saved pearls stay. */
export default function ResetProgressDialog() {
  const signedIn = useAccount((s) => s.status === 'signed-in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await resetProgress();
      closeResetProgress();
      announce('Your progress has been reset. Your saved pearls are still here.');
    } catch (e) {
      setError(friendlyMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal labelledBy={titleId} describedBy={descId} onClose={closeResetProgress} className="confirm-modal">
      <h2 id={titleId} className="modal-title">
        Reset your progress?
      </h2>
      <p id={descId} className="modal-text">
        Every word you’ve swiped goes back to new, {signedIn ? 'on all your devices' : 'in this browser'}, and the sea
        starts over. Your saved pearls stay.
      </p>
      {error && (
        <div className="form-error" role="alert">
          <p>{error}</p>
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-quiet" onClick={closeResetProgress} data-autofocus disabled={busy}>
          Keep my progress
        </button>
        <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy} aria-busy={busy}>
          {busy ? 'Resetting…' : 'Reset progress'}
        </button>
      </div>
    </Modal>
  );
}
