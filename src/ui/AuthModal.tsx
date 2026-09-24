import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { friendlyMessage, toAccountError } from '../account/errors';
import { accountsDemo } from '../account/backend';
import { auth, closeAuth, setAuthMode, useAccount, type AuthDialog } from '../account/store';
import { returnUrl } from '../account/urlState';
import { linkHandler } from '../lib/router';
import { WORD_BY_SLUG } from '../lib/words';
import { focusFirst, Modal } from './Modal';

const TITLES: Record<AuthDialog['mode'], string> = {
  signin: 'Sign in',
  signup: 'Create your account',
  forgot: 'Reset your password',
  'reset-sent': 'Check your inbox',
  'verify-sent': 'Check your inbox',
  reset: 'Choose a new password',
};

const CONTACT = import.meta.env.VITE_CONTACT_EMAIL;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEAK = 'Choose a longer password: at least 8 characters, ideally a short phrase.';

/** Sign in / sign up / password reset, as a small sheet over the sea. */
export default function AuthModal() {
  const dialog = useAccount((s) => s.auth)!;
  const titleId = useId();
  const descId = useId();
  const body = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState(dialog.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(dialog.error ?? null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const { mode } = dialog;

  // Each screen starts clean, with focus on its first field.
  useEffect(() => {
    setError(dialog.error ?? null);
    setErrorCode(null);
    setPassword('');
    setResent(false);
    if (dialog.email) setEmail(dialog.email);
    requestAnimationFrame(() => focusFirst(body.current));
  }, [mode, dialog.error, dialog.email]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setErrorCode(null);
    try {
      await fn();
    } catch (e) {
      const err = toAccountError(e);
      setError(friendlyMessage(err));
      setErrorCode(err.code);
    } finally {
      setBusy(false);
    }
  };

  const check = (needPassword: boolean, newPassword: boolean) => {
    if (!email.trim()) return 'Enter your email address.';
    if (!EMAIL.test(email.trim())) return 'That email address doesn’t look right.';
    if (needPassword && !password) return 'Enter your password.';
    if (newPassword && password.length < 8) return WEAK;
    return null;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === 'reset') {
      if (password.length < 8) return setError(WEAK);
      return void run(() => auth.updatePassword(password));
    }
    const problem = check(mode !== 'forgot', mode === 'signup');
    if (problem) return setError(problem);
    const addr = email.trim();
    if (mode === 'signin') void run(() => auth.signIn(addr, password));
    else if (mode === 'signup') void run(() => auth.signUp(addr, password, returnUrl('verify')));
    else if (mode === 'forgot') void run(() => auth.requestReset(addr, returnUrl('reset')));
  };

  const resend = () =>
    run(async () => {
      await auth.resend(email.trim(), returnUrl('verify'));
      setResent(true);
    });

  const word = dialog.reasonSlug ? WORD_BY_SLUG.get(dialog.reasonSlug) : undefined;
  const showGoogle = mode === 'signin' || mode === 'signup';
  const hasForm = mode === 'signin' || mode === 'signup' || mode === 'forgot' || mode === 'reset';
  const submitLabel = { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link', reset: 'Save new password' }[
    mode as 'signin'
  ];

  return (
    <Modal labelledBy={titleId} describedBy={dialog.reason && showGoogle ? descId : undefined} onClose={closeAuth} className="auth-modal">
      <button type="button" className="modal-close" onClick={closeAuth} aria-label="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div className="modal-pearl" aria-hidden="true" />
      <h2 id={titleId} className="modal-title">
        {TITLES[mode]}
      </h2>

      {dialog.reason && showGoogle && (
        <p id={descId} className="modal-reason">
          {dialog.reason}
          {word && (
            <>
              {' '}
              <span className="modal-reason-word" lang="ar" dir="rtl">
                {word.ar}
              </span>
            </>
          )}
        </p>
      )}
      {dialog.notice && <p className="modal-notice">{dialog.notice}</p>}
      {accountsDemo && showGoogle && (
        <p className="modal-notice">Preview mode: accounts live only in this browser, and no emails are sent.</p>
      )}

      <div ref={body} className="modal-body">
        {mode === 'verify-sent' && (
          <>
            <p className="modal-text">
              We sent a confirmation link to <strong>{dialog.email}</strong>. Open it to finish creating your account
              {word ? ', and we’ll keep your pearl waiting.' : '.'}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={closeAuth} data-autofocus>
                Done
              </button>
              <button type="button" className="btn btn-quiet" onClick={resend} disabled={busy || resent}>
                {resent ? 'Sent again' : busy ? 'Sending…' : 'Resend the link'}
              </button>
            </div>
          </>
        )}

        {mode === 'reset-sent' && (
          <>
            <p className="modal-text">
              If there’s an account for <strong>{dialog.email}</strong>, a link to choose a new password is on its way.
              Open it in this browser.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setAuthMode('signin')} data-autofocus>
                Back to sign in
              </button>
            </div>
          </>
        )}

        {showGoogle && (
          <>
            <button
              type="button"
              className="btn btn-google"
              onClick={() => run(() => auth.google(returnUrl('oauth')))}
              disabled={busy}
            >
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </button>
            <p className="modal-or" aria-hidden="true">
              <span>or with email</span>
            </p>
          </>
        )}

        {hasForm && (
          <form className="auth-form" onSubmit={submit} noValidate>
            {mode === 'forgot' && (
              <p className="modal-text">Enter your email and we’ll send you a link to choose a new password.</p>
            )}
            {mode !== 'reset' && (
              <div className="field">
                <label htmlFor="auth-email">Email</label>
                <input
                  type="email"
                  name="email"
                  id="auth-email"
                  autoComplete="email"
                  inputMode="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error && !email.trim()}
                  data-autofocus
                />
              </div>
            )}
            {mode !== 'forgot' && (
              <div className="field">
                <label htmlFor="auth-password">{mode === 'reset' ? 'New password' : 'Password'}</label>
                <span className="field-row">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    id="auth-password"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby={mode === 'signin' ? undefined : 'auth-password-hint'}
                    {...(mode === 'reset' ? { 'data-autofocus': true } : {})}
                  />
                  <button type="button" className="field-toggle" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? 'Hide' : 'Show'}
                    <span className="sr-only"> password</span>
                  </button>
                </span>
                {mode !== 'signin' && (
                  <span className="field-hint" id="auth-password-hint">
                    At least 8 characters.
                  </span>
                )}
              </div>
            )}

            {error && (
              <div className="form-error" role="alert">
                <p>{error}</p>
                {errorCode === 'email_unavailable' && (
                  <div className="form-error-help">
                    <p>
                      {mode === 'forgot'
                        ? 'If you signed up with Google, just continue with Google.'
                        : 'You can continue with Google instead.'}
                      {CONTACT && (
                        <>
                          {' '}
                          Otherwise write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we’ll help.
                        </>
                      )}
                    </p>
                    <button type="button" className="btn btn-google" onClick={() => run(() => auth.google(returnUrl('oauth')))} disabled={busy}>
                      Continue with Google
                    </button>
                  </div>
                )}
                {errorCode === 'email_not_confirmed' && (
                  <button type="button" className="link-btn" onClick={resend} disabled={busy || resent}>
                    {resent ? 'We sent a new link.' : 'Send the confirmation link again'}
                  </button>
                )}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
              {busy ? 'One moment…' : submitLabel}
            </button>

            {mode === 'signin' && (
              <button type="button" className="link-btn" onClick={() => setAuthMode('forgot', { email })}>
                Forgot your password?
              </button>
            )}
          </form>
        )}

        {!hasForm && error && (
          <div className="form-error" role="alert">
            <p>{error}</p>
          </div>
        )}
      </div>

      <div className="modal-switch">
        {mode === 'signin' && (
          <p>
            New to Durar?{' '}
            <button type="button" className="link-btn" onClick={() => setAuthMode('signup', { email })}>
              Create an account
            </button>
          </p>
        )}
        {(mode === 'signup' || mode === 'forgot') && (
          <p>
            {mode === 'signup' ? 'Already have an account? ' : ''}
            <button type="button" className="link-btn" onClick={() => setAuthMode('signin', { email })}>
              {mode === 'signup' ? 'Sign in' : 'Back to sign in'}
            </button>
          </p>
        )}
      </div>

      <p className="modal-privacy">
        We keep only your email and the words you save.{' '}
        <a
          href="/privacy"
          onClick={(e) => {
            closeAuth();
            linkHandler('/privacy')(e);
          }}
        >
          Privacy
        </a>
      </p>
    </Modal>
  );
}
