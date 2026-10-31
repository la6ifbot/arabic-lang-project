import { createPortal } from 'react-dom';
import { audioOf } from '../lib/audioKeys';
import { play, setSlow, useVoice } from '../lib/voice';
import { WORD_BY_SLUG } from '../lib/words';

// The voice chunk: everything here loads while the browser is idle (src/lib/voiceLoader.ts), so
// first paint only carries the loader.
export { playWord, prefetchWord, stop } from '../lib/voice';

/**
 * The speaker for a word's headword (`example` absent) or one of its sentences. `what` names the
 * sentence for the live region; the headword says itself ("the word دُرَّة").
 */
export function Speaker({ slug, example, what = 'the sentence', className }: { slug: string; example?: number; what?: string; className?: string }) {
  const a = audioOf(slug);
  if (example === undefined) return <SpeakButton audio={a?.word} what={`the word ${WORD_BY_SLUG.get(slug)?.ar ?? ''}`} kind="word" className={className} />;
  return <SpeakButton audio={a?.examples[example]} what={what} kind="sentence" className={className} />;
}

/** A speaker button for one headword or sentence (Phase 0.8, decision 4). */
function SpeakButton({
  audio,
  what,
  kind,
  className = '',
}: {
  audio: string | undefined;
  what: string;
  kind: 'word' | 'sentence';
  className?: string;
}) {
  const phase = useVoice((s) => (s.key === audio ? s.phase : 'idle'));
  if (!audio) return null;
  const label = `Play ${what}`;
  return (
    <span className={`speak speak-${kind} ${className}`} lang="en" dir="ltr">
      <button
        type="button"
        className="speak-btn"
        data-state={phase}
        aria-label={label}
        aria-keyshortcuts={kind === 'word' ? 'P' : 'Shift+P'}
        aria-busy={phase === 'loading' || undefined}
        title={`${label} (${kind === 'word' ? 'P' : 'Shift+P'})`}
        onClick={() => play(audio, what)}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid={`speak-${kind}`}
      >
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <circle className="speak-ring" cx="16" cy="16" r="10.5" />
          <path className="speak-cone" d={kind === 'word' ? 'M10.5 14h2.6l3.6-3v10l-3.6-3h-2.6z' : 'M9.5 14h2.4l3.4-2.8v9.6l-3.4-2.8h-2.4z'} />
          {kind === 'word' ? (
            <>
              <path className="speak-wave speak-wave-1" d="M19 13.4a3.6 3.6 0 0 1 0 5.2" />
              <path className="speak-wave speak-wave-2" d="M21.2 11.4a6.6 6.6 0 0 1 0 9.2" />
            </>
          ) : (
            // A sentence: lines of text instead of sound waves.
            <>
              <path className="speak-wave speak-wave-1" d="M19 12.6h3.8M19 16h3.8" />
              <path className="speak-wave speak-wave-2" d="M19 19.4h2.4" />
            </>
          )}
        </svg>
      </button>
      {phase === 'failed' && (
        <span className="speak-error" data-testid="speak-error">
          Audio unavailable
        </span>
      )}
    </span>
  );
}

/** Slow voice: the same audio at 0.75×, remembered on this device. */
export function SlowToggle() {
  const slow = useVoice((s) => s.slow);
  return (
    <button
      type="button"
      className="mode-toggle slow-toggle"
      aria-pressed={slow}
      title="Play word audio at three-quarter speed"
      onClick={() => setSlow(!slow)}
      data-testid="slow-toggle"
    >
      Slow voice
    </button>
  );
}

/** Says what the voice is doing ("Playing the word دُرَّة", "Audio unavailable"), outside #root like the account status. */
export function VoiceStatus() {
  const { text, id } = useVoice((s) => s.said);
  return createPortal(
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="voice-status">
      <span key={id}>{text}</span>
    </div>,
    document.body,
  );
}
