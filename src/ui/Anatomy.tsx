import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { anatomy, countLabel, describe, joinSentence, positional, shapes, type Form, type Letter } from '../../shared/anatomy';
import { prefersReducedMotion } from '../lib/device';
import { pronounce } from '../lib/pronounce';
import { WORD_BY_SLUG } from '../lib/words';
import { headAnchor } from '../state/anchors';
import { closeAnatomy, useDialogs } from '../state/dialogs';
import { useDurar } from '../state/store';
import { Modal } from './Modal';
import './anatomy.css';

type Stage = 'threaded' | 'letters' | 'syllables';

/** The letters slide apart, then each eases into its standalone shape: slow, like the rest of the sea. */
const UNTHREAD_MS = 2600;
const RETHREAD_MS = 1500;
const FADE_MS = 400;

const FORMS: { form: Form; label: string }[] = [
  { form: 'alone', label: 'Alone' },
  { form: 'start', label: 'Start' },
  { form: 'middle', label: 'Middle' },
  { form: 'end', label: 'End' },
];

/** Where the headword is on screen: over the 3D card, or the text-only card's heading. */
function headwordY(): number | null {
  if (useDurar.getState().textMode || !headAnchor.visible) {
    const h = document.querySelector('.html-card .wd-ar');
    if (h) {
      const r = h.getBoundingClientRect();
      return r.top + r.height / 2;
    }
  }
  return headAnchor.visible ? headAnchor.y : null;
}

/** What sits before a letter in the row: nothing, a thread (it joins), a break, or a word gap. */
const gapBefore = (letters: Letter[], i: number) => {
  const prev = letters[i - 1];
  if (!prev) return undefined;
  if (prev.word !== letters[i].word) return 'word';
  return letters[i].joinsPrev ? 'thread' : 'break';
};

/**
 * The anatomy of a word (Phase 0.7, section G): the focused headword unthreads like a string of
 * pearls. Letters slide apart right to left on a thin thread that breaks after letters that never
 * join forward, each keeps its in-word shape and then eases into its standalone one. A letter tap
 * shows its name, sound and four shapes; “Syllables” groups the letters into beads with their
 * sounds. Closing threads the word back together.
 */
export default function Anatomy() {
  const slug = useDialogs((s) => s.anatomy) ?? '';
  const word = WORD_BY_SLUG.get(slug);
  const a = useMemo(() => (word ? anatomy(word) : null), [word]);
  const reduced = useMemo(prefersReducedMotion, []);
  // Reduced motion: no slide, the letters simply fade in apart.
  const [stage, setStage] = useState<Stage>(() => (prefersReducedMotion() ? 'letters' : 'threaded'));
  const [closingNow, setClosingNow] = useState(false);
  const [settled, setSettled] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [style, setStyle] = useState<CSSProperties>({});
  const closing = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const letterEls = useRef<(HTMLButtonElement | null)[]>([]);
  const titleId = useId();
  const descId = useId();
  const detailId = useId();

  useEffect(() => {
    if (!word) closeAnatomy();
  }, [word]);

  // Open over the headword: the row of letters lines up with the word on the card.
  useLayoutEffect(() => {
    const p = panel.current;
    const r = row.current;
    if (!p || !r) return;
    const pr = p.getBoundingClientRect();
    const rr = r.getBoundingClientRect();
    const rowMid = rr.top - pr.top + rr.height / 2;
    const y = headwordY() ?? window.innerHeight * 0.36;
    const top = Math.max(12, Math.min(y - rowMid, window.innerHeight - pr.height - 12));
    setStyle({ marginTop: Math.round(top) });
  }, []);

  // Unthread a moment after the word appears in place.
  useEffect(() => {
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => setStage('letters'))));
    const t = window.setTimeout(() => setSettled(true), reduced ? FADE_MS : UNTHREAD_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [reduced]);

  // Focus goes back to where it was (Modal); after a tap or the L key that's the Letters button.
  useEffect(
    () => () => {
      window.setTimeout(() => {
        if (document.activeElement === document.body || !document.activeElement)
          document.querySelector<HTMLElement>('[data-visible="true"] [data-testid=anatomy-button], .html-card [data-testid=anatomy-button]')?.focus({ preventScroll: true });
      }, 0);
    },
    [],
  );

  /** Threads the word back together, then closes. */
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setSelected(null);
    setSettled(false);
    setClosingNow(true);
    if (!reduced) setStage('threaded');
    window.setTimeout(closeAnatomy, reduced ? FADE_MS : RETHREAD_MS);
  }, [reduced]);

  if (!word || !a) return null;

  const select = (i: number) => {
    setFocusIdx(i);
    setSelected(i);
  };
  const onRowKey = (e: KeyboardEvent) => {
    // Right to left: ← is the next letter, → the one before.
    const last = a.count - 1;
    const fromRow = e.target === e.currentTarget;
    const i =
      fromRow && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
        ? 0
        : e.key === 'ArrowLeft' ? Math.min(last, focusIdx + 1) : e.key === 'ArrowRight' ? Math.max(0, focusIdx - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (i === null) return;
    e.preventDefault();
    select(i);
    letterEls.current[i]?.focus();
  };

  const sel = selected !== null ? a.letters[selected] : null;
  const sylls = stage === 'syllables';
  const play = pronounce.play;

  return (
    <Modal
      labelledBy={titleId}
      describedBy={descId}
      onClose={close}
      className="anat"
      backdropClassName="anat-backdrop"
      style={style}
    >
      <div
        ref={panel}
        className="anat-panel"
        data-testid="anatomy"
        data-stage={stage}
        data-settled={settled || undefined}
        data-reduced={reduced || undefined}
        data-closing={closingNow || undefined}
        onClick={(e) => {
          // A tap on the open water around the word threads it back together.
          const t = e.target as HTMLElement;
          if (t === e.currentTarget || t.classList.contains('anat-stage') || t.classList.contains('anat-row')) close();
        }}
      >
        <h2 id={titleId} className="anat-title">
          <span lang="ar" dir="rtl">
            {word.ar}
          </span>
          <span> · </span>
          <span>{sylls ? 'Syllables' : 'Letters'}</span>
        </h2>
        <p id={descId} className="anat-sr">
          {describe(a)}
        </p>
        <button type="button" className="modal-close" onClick={close} aria-label="Close" data-testid="anatomy-close">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className="anat-stage">
          <div
            ref={row}
            className="anat-row"
            role="group"
            aria-label={`${countLabel(a.count)}. Use the arrow keys to move between them.`}
            dir="rtl"
            lang="ar"
            data-state={stage === 'threaded' ? 'threaded' : 'apart'}
            style={{ '--n': a.count + a.words - 1 } as CSSProperties}
            aria-hidden={sylls || undefined}
            inert={sylls || undefined}
            onKeyDown={onRowKey}
            tabIndex={-1}
            data-autofocus
            data-testid="anatomy-letters"
          >
            {a.letters.map((l, i) => (
              <button
                key={i}
                ref={(el) => {
                  letterEls.current[i] = el;
                }}
                type="button"
                className="anat-letter"
                data-gap={gapBefore(a.letters, i)}
                style={{ '--i': i } as CSSProperties}
                tabIndex={focusIdx === i ? 0 : -1}
                aria-pressed={selected === i}
                aria-controls={detailId}
                aria-label={`${l.info.name.tr}${l.doubled ? ', doubled' : ''}`}
                onClick={() => select(i)}
                onFocus={() => setFocusIdx(i)}
                data-testid="anatomy-letter"
              >
                <span className="anat-in" aria-hidden="true">
                  {positional(l)}
                </span>
                <span className="anat-alone" aria-hidden="true">
                  {l.base + l.marks}
                </span>
                {l.doubled && <span className="anat-doubled" aria-hidden="true" />}
              </button>
            ))}
          </div>

          <ol className="anat-beads" dir="rtl" aria-label="Syllables" aria-hidden={!sylls || undefined} inert={!sylls || undefined} data-testid="anatomy-syllables">
            {a.syllables.map((s, i) => (
              <li key={i} className="anat-bead-item" data-word-start={(i > 0 && a.syllables[i - 1].word !== s.word) || undefined}>
                <span className="anat-bead" lang="ar">
                  {s.ar}
                </span>
                <span className="anat-bead-tr" dir="ltr">
                  {s.tr}
                </span>
                {play && (
                  <button type="button" className="anat-listen" onClick={() => play({ kind: 'syllable', slug, index: i, tr: s.tr })}>
                    Listen<span className="anat-sr"> to {s.tr}</span>
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>

        <p className="anat-count" data-testid="anatomy-count">
          {sylls ? a.syllables.map((s) => s.tr).join(' · ') : countLabel(a.count)}
        </p>
        <p className="anat-joins">{sylls ? `${a.syllables.length} syllable${a.syllables.length === 1 ? '' : 's'}` : joinSentence(a)}</p>

        <div className="anat-steps">
          <button type="button" className="anat-step" aria-pressed={!sylls} onClick={() => setStage('letters')} data-testid="anatomy-letters-step">
            Letters
          </button>
          <button type="button" className="anat-step" aria-pressed={sylls} onClick={() => setStage('syllables')} data-testid="anatomy-syllables-step">
            Syllables
          </button>
          {play && (
            <button type="button" className="anat-step" onClick={() => play({ kind: 'word', slug })}>
              Listen
            </button>
          )}
        </div>

        <section id={detailId} className="anat-detail" aria-live="polite" hidden={sylls} data-testid="anatomy-detail">
          {sel ? (
            <>
              <p className="anat-name">
                <span lang="ar" dir="rtl" className="anat-name-ar">
                  {sel.info.name.ar}
                </span>{' '}
                <span className="anat-name-tr">{sel.info.name.tr}</span>
              </p>
              <p className="anat-sound">Sounds like {sel.info.sound}.</p>
              <ul className="anat-shapes" aria-label="Its four shapes">
                {FORMS.map(({ form, label }) => {
                  const shape = shapes(sel.info)[form];
                  return (
                    <li key={form} data-here={sel.form === form || undefined}>
                      <span className="anat-shape" lang="ar" aria-hidden={!shape || undefined}>
                        {shape ?? '–'}
                      </span>
                      <span className="anat-shape-label">
                        {label}
                        {!shape && <span className="anat-sr">: never written there</span>}
                        {sel.form === form && <span className="anat-sr">, its shape in this word</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="anat-note anat-here-note">
                The lit shape is the one it takes in{' '}
                <bdi lang="ar" className="anat-inline-ar">
                  {word.ar}
                </bdi>
                .
              </p>
              {sel.doubled && <p className="anat-note">Doubled: written once with a shadda (ّ), said twice.</p>}
              {sel.info.final && <p className="anat-note">Only ever written at the end of a word.</p>}
              {sel.info.note && <p className="anat-note">{sel.info.note}</p>}
              {play && (
                <button type="button" className="anat-listen" onClick={() => play({ kind: 'letter', char: sel.base })}>
                  Listen
                </button>
              )}
            </>
          ) : (
            <p className="anat-hint">Tap a letter to meet it.</p>
          )}
        </section>
      </div>
    </Modal>
  );
}
