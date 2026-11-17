import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { accountsMode } from '../account/backend';
import { hasCoarsePointer } from '../lib/anatomyTeach';
import { noteWordHinted } from '../lib/wordTap';
import { endTour } from '../state/tour';
import { focusables } from './Modal';

type Box = { left: number; top: number; right: number; bottom: number };

/** The card on screen: the 3D card's box (mirrored by SaveAnchor.tsx), or the text-only card. */
function cardBox(): Box | null {
  const raw = document.querySelector<HTMLElement>('.save-anchor')?.dataset.card;
  if (raw) {
    const [left, top, right, bottom] = raw.split(',').map(Number);
    if (right - left > 20) return { left, top, right, bottom };
  }
  return box('.html-card:not(.html-card-ghost)');
}

function box(selector: string): Box | null {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el || el.offsetParent === null) return null;
  const r = el.getBoundingClientRect();
  return r.width ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
}

/** The headword: around the 3D card's headword centre, or the text card's heading. */
function wordBox(): Box | null {
  const anchor = document.querySelector<HTMLElement>('.save-anchor');
  const card = cardBox();
  if (anchor?.dataset.head && card && anchor.dataset.card) {
    const [x, y] = anchor.dataset.head.split(',').map(Number);
    const w = (card.right - card.left) * 0.78;
    const h = (card.bottom - card.top) * 0.2;
    return { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 };
  }
  return box('.html-card:not(.html-card-ghost) .wd-ar');
}

interface Step {
  id: string;
  title: string;
  text: (tap: string) => string;
  target: () => Box | null;
  demo?: boolean;
}

const STEPS: Step[] = [
  {
    id: 'card',
    title: 'One word, one pearl',
    text: () => 'Each card is one Arabic word, with what it means and a sentence that uses it.',
    target: cardBox,
  },
  {
    id: 'word',
    title: 'See its letters',
    text: (tap) => `${tap} the big Arabic word to see its letters, one by one.`,
    target: wordBox,
  },
  {
    id: 'swipe',
    title: 'Turn the pages',
    text: () =>
      'Swipe right for the next word and left to go back, like the pages of an Arabic book. Know a word? Swipe it up and it sinks into the deep. The Next, I know it and Previous buttons below do the same.',
    target: () => {
      // On phones the words under the round arrows hang below the row: light them too.
      const b = box('.controls');
      if (!b) return null;
      return [...document.querySelectorAll<HTMLElement>('.ctrl-under')].reduce<Box>((acc, el) => {
        if (el.offsetParent === null) return acc;
        const r = el.getBoundingClientRect();
        return { left: Math.min(acc.left, r.left), top: acc.top, right: Math.max(acc.right, r.right), bottom: Math.max(acc.bottom, r.bottom) };
      }, b);
    },
    demo: true,
  },
  {
    id: 'buttons',
    title: 'Under the card',
    text: () =>
      `Listen to the word, see its letters, look up the harder words in its sentence with “Hard words”, share it${accountsMode !== 'off' ? ', or keep it with the small pearl' : ''}.`,
    target: () => box('.save-anchor .card-actions') ?? box('.card-actions-in-card'),
  },
  {
    id: 'topics',
    title: 'Choose a part of the sea',
    text: (tap) => `Water, sky, flowers and more. ${tap} the “?” at the top any time for help and settings.`,
    target: () => box('.topics-button'),
  },
];

const PAD = 8;
const GAP = 14;
const same = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.right - b.right) < 1 && Math.abs(a.bottom - b.bottom) < 1);

/**
 * A short first-time walk-through: a soft light on one part of the screen at a time (the card, the
 * word, the swipe, the buttons, the topics) with a line or two on what it does. Skip, Back and Next;
 * arrow keys and Escape work too. It holds the screen while it runs, so a stray tap never swipes.
 * The step on the word counts as the “tap the word” hint (src/ui/WordTapHint.tsx), so that one-time
 * pill doesn't repeat it; the word's glow carries on until the first tap.
 */
export default function Tour() {
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState<Box | null>(null);
  const [bubbleH, setBubbleH] = useState(180);
  const bubble = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const textId = useId();
  const tap = hasCoarsePointer() ? 'Tap' : 'Click';
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  // Holds the page: no shortcuts, swipes or other hints while it runs; focus comes back after.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.dataset.modal = 'tour';
    return () => {
      if (document.body.dataset.modal === 'tour') delete document.body.dataset.modal;
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (s.id === 'word') noteWordHinted();
    next.current?.focus();
  }, [s.id]);

  // Follows its target (the card drifts a little, the browser bars come and go).
  useEffect(() => {
    let raf = 0;
    let shown: Box | null = null;
    const tick = () => {
      const b = s.target();
      if (!same(b, shown)) {
        shown = b;
        setTarget(b);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [s]);

  useLayoutEffect(() => {
    if (bubble.current) setBubbleH(bubble.current.offsetHeight);
  }, [step, target]);

  const go = (i: number) => (i >= STEPS.length ? endTour() : setStep(Math.max(0, i)));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      endTour();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(step + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(step - 1);
    } else if (e.key === 'Tab' && bubble.current) {
      const items = focusables(bubble.current);
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        items[items.length - 1]?.focus();
      } else if (!e.shiftKey && i === items.length - 1) {
        e.preventDefault();
        items[0]?.focus();
      }
    }
    e.stopPropagation();
  };

  // The bubble goes on the side of the light with more room; with room on neither, over its bottom.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(320, vw - 32);
  let top = vh / 2 - bubbleH / 2;
  let left = vw / 2 - width / 2;
  if (target) {
    const above = target.top - PAD - GAP;
    const below = vh - target.bottom - PAD - GAP;
    if (below >= bubbleH + 8 && below >= above) top = target.bottom + PAD + GAP;
    else if (above >= bubbleH + 8) top = target.top - PAD - GAP - bubbleH;
    else top = Math.max(16, target.bottom - PAD - bubbleH - 12);
    left = (target.left + target.right) / 2 - width / 2;
  }
  left = Math.min(vw - 16 - width, Math.max(16, left));
  top = Math.min(vh - 16 - bubbleH, Math.max(16, top));

  return (
    <div className="tour" onKeyDown={onKey} data-testid="tour" data-step={s.id}>
      {target ? (
        <div
          className="tour-light"
          aria-hidden="true"
          style={{
            left: target.left - PAD,
            top: target.top - PAD,
            width: target.right - target.left + PAD * 2,
            height: target.bottom - target.top + PAD * 2,
          }}
        />
      ) : (
        <div className="tour-dim" aria-hidden="true" />
      )}
      <div
        ref={bubble}
        className="tour-bubble"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        style={{ left, top, width }}
      >
        <p className="tour-count" aria-hidden="true">
          {STEPS.map((x, i) => (
            <span key={x.id} className="tour-dot" data-on={i === step || undefined} />
          ))}
        </p>
        <h2 id={titleId} className="tour-title">
          <span className="sr-only">
            Step {step + 1} of {STEPS.length}:{' '}
          </span>
          {s.title}
        </h2>
        <p id={textId} className="tour-text">
          {s.text(tap)}
        </p>
        {s.demo && (
          <div className="tour-demo" aria-hidden="true">
            <span className="tour-demo-up">↑ I know it</span>
            <span className="tour-demo-side">← previous</span>
            <span className="tour-demo-card" />
            <span className="tour-demo-side">next →</span>
          </div>
        )}
        <div className="tour-actions">
          {!last && (
            <button type="button" className="tour-skip" onClick={endTour} data-testid="tour-skip">
              Skip
            </button>
          )}
          {step > 0 && (
            <button type="button" className="tour-btn" onClick={() => go(step - 1)} data-testid="tour-back">
              Back
            </button>
          )}
          <button ref={next} type="button" className="tour-btn tour-next" onClick={() => go(step + 1)} data-testid="tour-next">
            {last ? 'Start' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
