import { useEffect, useState } from 'react';
import { toggleSave, useAccount } from '../account/store';
import { WORD_BY_SLUG } from '../lib/words';

/**
 * “Save to My Pearls” for the focused card. A pearl outline when not saved, a lustrous pearl when
 * saved. Used over the 3D card (positioned by the scene) and inside the text-only card.
 */
export function SaveButton({ slug, className = '' }: { slug: string; className?: string }) {
  const status = useAccount((s) => s.status);
  const saved = useAccount((s) => !!s.saved[slug]);
  const error = useAccount((s) => (s.saveError?.slug === slug ? s.saveError : null));
  const [showError, setShowError] = useState(false);
  const word = WORD_BY_SLUG.get(slug);

  useEffect(() => {
    if (!error) return;
    setShowError(true);
    const id = window.setTimeout(() => setShowError(false), 4500);
    return () => window.clearTimeout(id);
  }, [error]);

  if (status === 'off' || !word) return null;

  return (
    <div className={`save ${className}`}>
      <button
        type="button"
        className="save-btn"
        aria-pressed={saved}
        aria-label={`Save ${word.ar} to My Pearls`}
        aria-keyshortcuts="S"
        title={saved ? 'Saved to My Pearls (S)' : 'Save to My Pearls (S)'}
        onClick={() => void toggleSave(slug)}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid="save-button"
      >
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <radialGradient id="save-pearl-fill" cx="38%" cy="32%" r="72%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset=".4" stopColor="#e8f3f3" />
              <stop offset=".75" stopColor="#a7cdd3" />
              <stop offset="1" stopColor="#5b8e99" />
            </radialGradient>
          </defs>
          <circle className="save-ring" cx="16" cy="16" r="10.5" />
          <circle className="save-fill" cx="16" cy="16" r="10.5" fill="url(#save-pearl-fill)" />
          <circle className="save-glint" cx="12.5" cy="12" r="2.4" />
        </svg>
      </button>
      {showError && error && (
        <p className="save-error" role="presentation">
          {error.text}
        </p>
      )}
    </div>
  );
}
