import { useEffect, useState } from 'react';
import { UNDO_MS, useDurar } from '../state/store';

/**
 * A quiet “Undo” for about five seconds after “I know it” (Phase 0.9, decision 4). The card comes
 * back into focus and its review is never sent (src/progress/engine.ts holds it back that long).
 */
export function UndoButton() {
  const known = useDurar((s) => s.known);
  const undo = useDurar((s) => s.undo);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!known) return setOpen(false);
    const left = known.at + UNDO_MS - Date.now();
    if (left <= 0) return setOpen(false);
    setOpen(true);
    const id = window.setTimeout(() => setOpen(false), left);
    return () => window.clearTimeout(id);
  }, [known]);

  if (!open) return null;
  return (
    <button
      type="button"
      className="undo-btn"
      onClick={() => {
        undo();
        // The button goes away with the click: keep keyboard focus on the row, not lost to the page.
        document.querySelector<HTMLElement>('[data-testid=btn-know]')?.focus();
      }}
      data-testid="btn-undo"
    >
      Undo
    </button>
  );
}
