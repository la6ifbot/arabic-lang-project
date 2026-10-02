import { invited, toggleMusic, useMusic } from '../lib/music';

/** Round speaker button beside “?”: music is off until the visitor taps it, and the choice is remembered. */
export function MusicButton() {
  const playing = useMusic((s) => s.playing);
  const failed = useMusic((s) => s.failed);
  const invite = useMusic((s) => s.invite);
  if (failed) return null;

  return (
    <button
      type="button"
      className="help-btn music-btn"
      aria-pressed={playing}
      aria-label="Background music"
      title={playing ? 'Turn the music off' : 'Play music'}
      onClick={toggleMusic}
      onAnimationEnd={invite ? invited : undefined}
      data-invite={invite || undefined}
      data-music-toggle
      data-testid="music-toggle"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" />
        {playing ? (
          <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M15.2 9.2a4 4 0 0 1 0 5.6" />
            <path d="M17.6 6.8a7.4 7.4 0 0 1 0 10.4" />
          </g>
        ) : (
          <path d="m15.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}
