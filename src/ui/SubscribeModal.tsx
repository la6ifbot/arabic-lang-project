import { useId, useState, type FormEvent } from 'react';
import { useAccount } from '../account/store';
import { EmailApiError, subscribeEmail } from '../lib/emailApi';
import { linkHandler } from '../lib/router';
import { closeSubscribe } from '../state/dialogs';
import { Modal } from './Modal';

const MESSAGES: Record<string, string> = {
  invalid_email: 'That email address doesn’t look right.',
  rate_limited: 'Too many tries from here just now. Please try again in an hour.',
  network: 'We couldn’t reach the server. Check your connection and try again.',
  server: 'Something went wrong on our side. Please try again in a moment.',
};

/** “Get the Pearl of the Day by email”: the same dark-glass sheet as sign-in. */
export default function SubscribeModal() {
  const account = useAccount((s) => s.user);
  const [email, setEmail] = useState(account?.email ?? '');
  const [website, setWebsite] = useState(''); // honeypot: invisible to people, tempting to bots
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'check_inbox' | 'confirmed'>(null);
  const titleId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { bootAccounts } = await import('../account/store');
      const backend = account ? await bootAccounts() : null;
      const own = account?.email && account.email.toLowerCase() === email.trim().toLowerCase();
      setDone(await subscribeEmail(email, { website, accessToken: own && backend ? await backend.accessToken() : null }));
    } catch (err) {
      setError(MESSAGES[err instanceof EmailApiError ? err.code : 'server']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal labelledBy={titleId} onClose={closeSubscribe} className="auth-modal subscribe-modal">
      <button type="button" className="modal-close" onClick={closeSubscribe} aria-label="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div className="modal-pearl" aria-hidden="true" />
      <h2 id={titleId} className="modal-title">
        {done === 'check_inbox' ? 'Check your inbox to confirm' : done === 'confirmed' ? 'You’re subscribed' : 'Pearl of the Day by email'}
      </h2>
      <p className="modal-reason">
        <span className="modal-reason-word" lang="ar" dir="rtl">
          دُرَّةُ اليَوْم
        </span>
      </p>

      <div className="modal-body" data-testid="subscribe-body">
        {done === 'check_inbox' && (
          <>
            <p className="modal-text" role="status">
              We’ve sent a link to <strong>{email.trim().toLowerCase()}</strong>. Open it and the pearls will start arriving
              each morning. The link works for 7 days.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={closeSubscribe} data-autofocus>
                Done
              </button>
            </div>
          </>
        )}
        {done === 'confirmed' && (
          <>
            <p className="modal-text" role="status">
              The next pearl reaches <strong>{email.trim().toLowerCase()}</strong> at about 7:00, Amsterdam time.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={closeSubscribe} data-autofocus>
                Done
              </button>
            </div>
          </>
        )}
        {!done && (
          <form className="auth-form" onSubmit={submit} noValidate>
            <p className="modal-text">
              One Arabic word each morning at about 7:00 (Amsterdam time): the word, its meaning and a sentence to hold it.
              No tracking. Unsubscribe with one click.
            </p>
            <div className="field">
              <label htmlFor="subscribe-email">Email</label>
              <input
                id="subscribe-email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error === MESSAGES.invalid_email || undefined}
                data-autofocus
              />
            </div>
            {/* A neutral name and label, and no password-manager fill: browsers and managers fill fields
                called “website”, and a filled honeypot quietly drops a real person's request. */}
            <div className="hp" aria-hidden="true">
              <label htmlFor="subscribe-extra">Leave this empty</label>
              <input
                id="subscribe-extra"
                name="extra"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                data-form-type="other"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            {error && (
              <div className="form-error" role="alert">
                <p>{error}</p>
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
              {busy ? 'One moment…' : 'Send me the pearls'}
            </button>
          </form>
        )}
      </div>
      <p className="modal-privacy">
        We keep only your address, to send the email.{' '}
        <a
          href="/privacy"
          onClick={(e) => {
            closeSubscribe();
            linkHandler('/privacy')(e);
          }}
        >
          Privacy
        </a>
      </p>
    </Modal>
  );
}
