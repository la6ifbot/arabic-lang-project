import { createPortal } from 'react-dom';
import { accountsMode } from '../account/backend';
import { useAccount } from '../account/store';

/**
 * Polite live region for account events (saved, removed, signed out…). Portaled outside #root so
 * it keeps speaking while a dialog makes the page inert.
 */
export function StatusAnnouncer() {
  const { text, id } = useAccount((s) => s.announcement);
  if (accountsMode === 'off') return null;
  return createPortal(
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="account-status">
      <span key={id}>{text}</span>
    </div>,
    document.body,
  );
}
