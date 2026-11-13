import { useEffect, useState } from 'react';

/**
 * iPhone Safari only (see wantsInstallHint): a one-time tip, since the Home Screen app is the only
 * way to get Durar full screen there. Loaded lazily; App decides whether to show it at all.
 */
export default function InstallHint() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.body.dataset.modal) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="install-hint" role="status" data-testid="install-hint">
      <p>
        Tip: add Durar to your Home Screen for full screen. Tap Share, then{' '}
        <strong>Add to Home Screen</strong>.
      </p>
      <button type="button" className="install-close" aria-label="Dismiss tip" onClick={() => setOpen(false)} data-testid="install-hint-close">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
