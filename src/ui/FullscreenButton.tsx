import { useEffect, useState } from 'react';
import { FULLSCREEN_EVENTS, isFullscreen, offersFullscreen, toggleFullscreen } from '../lib/fullscreen';

/**
 * Enter / exit fullscreen, next to “?”. Shown only where the browser allows it (not on iPhone), and
 * not inside the installed app, which already opens full screen. Esc, the button or F leave it.
 */
export function FullscreenButton() {
  const [supported] = useState(() => offersFullscreen());
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!supported) return;
    const sync = () => setOn(isFullscreen());
    for (const ev of FULLSCREEN_EVENTS) document.addEventListener(ev, sync);
    return () => {
      for (const ev of FULLSCREEN_EVENTS) document.removeEventListener(ev, sync);
    };
  }, [supported]);

  if (!supported) return null;
  return (
    <button
      type="button"
      className="help-btn fullscreen-btn"
      aria-label={on ? 'Exit full screen' : 'Full screen'}
      title={on ? 'Exit full screen (F)' : 'Full screen (F)'}
      onClick={() => void toggleFullscreen()}
      data-testid="fullscreen-button"
      data-on={on || undefined}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {on ? <path d="M6 1.5V6H1.5M10 1.5V6h4.5M6 14.5V10H1.5M10 14.5V10h4.5" /> : <path d="M1.5 6V1.5H6M14.5 6V1.5H10M1.5 10v4.5H6M14.5 10v4.5H10" />}
      </svg>
    </button>
  );
}
