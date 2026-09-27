import { useEffect, useId, useRef, useState } from 'react';
import { accountsMode } from '../account/backend';
import { openAbout } from '../state/dialogs';

/** “?” in the top-left corner: a small box with how to use the sea, and a way into “What is Durar?”. */
export function HelpBox() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const boxId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.body.dataset.modal) return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="help">
      <button
        ref={button}
        type="button"
        className="help-btn"
        aria-expanded={open}
        aria-controls={boxId}
        aria-label="How it works"
        onClick={() => setOpen((o) => !o)}
        data-testid="help-button"
      >
        <span aria-hidden="true">?</span>
      </button>
      <div ref={box} id={boxId} className="help-box" role="region" aria-labelledby={titleId} hidden={!open} data-testid="help-box">
        <h2 id={titleId} className="help-title">
          How it works
        </h2>
        <ul className="help-list">
          <li>
            <span className="help-key">Swipe right</span>
            <span className="help-kbd"> or press →</span> when you know the word. The pearl sinks into the deep.
          </li>
          <li>
            <span className="help-key">Swipe left</span>
            <span className="help-kbd"> or press ←</span> if you’re still learning it. It comes back soon.
          </li>
          <li>
            <span className="help-key">Tap a pearl</span> in the background to bring it forward.
          </li>
          <li>
            <span className="help-key">Search</span> in Arabic or English, top right.<span className="help-kbd"> Press / to jump there.</span>
          </li>
          {accountsMode !== 'off' && (
            <li>
              <span className="help-key">Save</span> a word with the small pearl on its
              card<span className="help-kbd">, or press S</span>. Sign in to keep your
              pearls on every device.
            </li>
          )}
        </ul>
        <button
          type="button"
          className="help-about"
          onClick={() => {
            setOpen(false);
            openAbout();
          }}
          data-testid="about-open"
        >
          What is Durar?
        </button>
      </div>
    </div>
  );
}
