import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { cancelIdle, whenIdle } from '../lib/idle';
import { WORD_BY_SLUG } from '../lib/words';

// All sharing code (image renderer, share sheet, menu) loads on first use.
type ShareModule = typeof import('../share/share');
let shareModule: ShareModule | undefined;
const loadShare = () => import('../share/share').then((m) => (shareModule = m));
const loadMenu = () => import('./ShareMenu');
const ShareMenu = lazy(loadMenu);

/** Phones (touch-first, with a system share sheet) use the sheet; everything else gets the menu. */
const systemSheet = () => typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;

export function ShareButton({ slug }: { slug: string }) {
  const word = WORD_BY_SLUG.get(slug);
  // undefined until the menu is first opened (that's when its code loads).
  const [open, setOpen] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const sheet = systemSheet();

  useEffect(() => {
    setOpen((o) => o && false);
    if (!word || !sheet) return;
    // Draw this card's image while the phone is idle, so a tap can open the share sheet at once.
    let idle = 0;
    const t = window.setTimeout(() => {
      idle = whenIdle(() =>
        void loadShare()
          .then((m) => m.prepare(word))
          .then(() => button.current?.setAttribute('data-ready', word.slug))
          .catch(() => {}),
      );
    }, 1200);
    return () => {
      window.clearTimeout(t);
      cancelIdle(idle);
    };
  }, [word, sheet]);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(''), 2600);
    return () => window.clearTimeout(t);
  }, [note]);

  if (!word) return null;

  /** Shows a quiet “preparing” state if a task takes more than a moment. */
  const busyWhile = async <T,>(task: Promise<T>): Promise<T> => {
    const t = window.setTimeout(() => setBusy(true), 150);
    try {
      return await task;
    } finally {
      window.clearTimeout(t);
      setBusy(false);
    }
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onClick = async () => {
    if (open) return close(false);
    if (!sheet) return setOpen(true);
    // `shareModule` is loaded by the idle pre-render; then nothing is awaited before the sheet opens.
    const outcome = await busyWhile((shareModule ?? (await loadShare())).shareOnPhone(word));
    if (outcome === 'menu') setOpen(true);
    else if (outcome === 'retry') setNote('Image ready. Tap Share again.');
  };

  return (
    <div className="share">
      <button
        ref={button}
        type="button"
        className="share-btn"
        aria-label={`Share ${word.ar}`}
        title="Share"
        aria-haspopup={sheet ? undefined : 'menu'}
        aria-expanded={sheet ? undefined : !!open}
        aria-controls={open ? menuId : undefined}
        aria-busy={busy || undefined}
        onClick={() => void onClick()}
        onPointerEnter={sheet ? undefined : () => void loadMenu()}
        onFocus={sheet ? undefined : () => void loadMenu()}
        data-testid="share-button"
      >
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <circle className="share-ring" cx="16" cy="16" r="10.5" />
          <path className="share-glyph" d="M16 18.2V10.4M13.2 13.1 16 10.3l2.8 2.8M12.4 15.6v4.2h7.2v-4.2" />
        </svg>
      </button>
      {open !== undefined && (
        <Suspense fallback={null}>
          <ShareMenu id={menuId} word={word} open={open} anchor={button} close={close} note={setNote} busyWhile={busyWhile} />
        </Suspense>
      )}
      <p className="share-note" aria-live="polite" data-testid="share-note">
        {note}
      </p>
    </div>
  );
}
