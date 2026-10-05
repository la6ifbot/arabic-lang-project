import { useEffect, useId, useRef, useState } from 'react';
import { downloadMyData, loadEmailToggle, openAuth, setEmailToggle, signOut, useAccount, useEmailToggle } from '../account/store';
import { emailSignupEnabled } from '../lib/flags';
import { navigate } from '../lib/router';
import { openResetProgress } from '../state/dialogs';
import { WORD_BY_SLUG } from '../lib/words';

/** Account entry in the top-left corner: “Sign in”, or a small pearl that opens a menu. */
export function AccountMenu() {
  const status = useAccount((s) => s.status);
  const user = useAccount((s) => s.user);
  const count = useAccount((s) => Object.keys(s.saved).filter((k) => WORD_BY_SLUG.has(k)).length);
  const [open, setOpen] = useState(false);
  const emailState = useEmailToggle((st) => st.state);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    if (emailSignupEnabled && useEmailToggle.getState().state === 'unknown') void loadEmailToggle();
    const onDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  if (status === 'off') return null;

  if (status === 'loading') {
    return <span className="acct-pearl acct-pearl-loading" role="img" aria-label="Checking your account" />;
  }

  if (status !== 'signed-in' || !user) {
    return (
      <button type="button" className="acct-signin" onClick={() => openAuth('signin')} data-testid="sign-in">
        Sign in
      </button>
    );
  }

  const initial = (user.email ?? '?').trim().charAt(0).toUpperCase();
  const choose = (fn: () => void) => () => {
    close(false);
    fn();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="acct">
      <button
        ref={button}
        type="button"
        className="acct-pearl"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account: ${user.email ?? 'signed in'}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        data-testid="account-button"
      >
        <span aria-hidden="true">{initial}</span>
      </button>
      {open && (
        <div ref={menu} id={menuId} role="menu" aria-label="Account" className="acct-menu" onKeyDown={onMenuKey}>
          <p className="acct-email" role="none">
            {user.email}
          </p>
          <button type="button" role="menuitem" className="acct-item" onClick={choose(() => navigate('/library'))}>
            My Pearls
            <span className="acct-count" aria-label={`${count} saved`}>
              {count}
            </span>
          </button>
          {emailSignupEnabled && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={emailState === 'on' ? true : emailState === 'pending' ? 'mixed' : false}
              aria-disabled={emailState === 'loading' || emailState === 'blocked' || undefined}
              className="acct-item"
              onClick={() => {
                if (emailState === 'loading' || emailState === 'blocked') return;
                void setEmailToggle(emailState !== 'on');
              }}
              data-testid="email-toggle"
            >
              Pearl of the Day email
              <span className="acct-switch" data-state={emailState}>
                {{ on: 'On', pending: 'Confirm in inbox', off: 'Off', blocked: 'Unavailable', loading: '…', unknown: '…' }[emailState]}
              </span>
            </button>
          )}
          <button type="button" role="menuitem" className="acct-item" onClick={choose(() => navigate('/privacy'))}>
            Privacy
          </button>
          <button
            type="button"
            role="menuitem"
            className="acct-item"
            onClick={choose(() => void downloadMyData())}
            data-testid="download-my-data"
          >
            Download my data
          </button>
          <button type="button" role="menuitem" className="acct-item" onClick={choose(() => void signOut().catch(() => {}))}>
            Sign out
          </button>
          <div className="acct-sep" role="separator" />
          <button type="button" role="menuitem" className="acct-item" onClick={choose(openResetProgress)}>
            Reset my progress…
          </button>
          <button
            type="button"
            role="menuitem"
            className="acct-item acct-danger"
            onClick={choose(() => useAccount.setState({ confirmDelete: true }))}
          >
            Delete my account…
          </button>
        </div>
      )}
    </div>
  );
}
