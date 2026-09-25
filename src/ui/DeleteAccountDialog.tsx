import { useId, useState } from 'react';
import { friendlyMessage } from '../account/errors';
import { deleteAccount, useAccount } from '../account/store';
import { navigate, useRoute } from '../lib/router';
import { WORD_BY_SLUG } from '../lib/words';
import { Modal } from './Modal';

export default function DeleteAccountDialog() {
  const user = useAccount((s) => s.user);
  const count = useAccount((s) => Object.keys(s.saved).filter((k) => WORD_BY_SLUG.has(k)).length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();
  const cancel = () => useAccount.setState({ confirmDelete: false });

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      if (useRoute.getState().route.name === 'library') navigate('/');
    } catch (e) {
      setError(friendlyMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal labelledBy={titleId} describedBy={descId} onClose={cancel} className="confirm-modal">
      <h2 id={titleId} className="modal-title">
        Delete your account?
      </h2>
      <p id={descId} className="modal-text">
        This permanently deletes your account{user?.email ? <> (<strong>{user.email}</strong>)</> : null} and{' '}
        {count === 1 ? 'the 1 pearl' : `the ${count} pearls`} you’ve saved, along with your progress. It can’t be undone.
      </p>
      {error && (
        <div className="form-error" role="alert">
          <p>{error}</p>
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-quiet" onClick={cancel} data-autofocus disabled={busy}>
          Keep my account
        </button>
        <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy} aria-busy={busy}>
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </Modal>
  );
}
