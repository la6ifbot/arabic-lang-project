import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { TOPICS, WHOLE_SEA } from '../lib/topics';
import { useDurar } from '../state/store';
import { chooseTopic } from '../state/topic';

const OPTIONS = [{ id: null as string | null, name: WHOLE_SEA }, ...TOPICS.map((t) => ({ id: t.id as string | null, name: t.name }))];

/**
 * A quiet control under the search: "The whole sea" or one of the topics. A menu button with
 * menuitemradio items: arrows, Home/End, Enter/Space, Escape and Tab work as expected.
 */
export function TopicPicker() {
  const topic = useDurar((s) => s.topic);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = OPTIONS.find((o) => o.id === topic) ?? OPTIONS[0];
  const selected = OPTIONS.indexOf(current);

  // Which item takes focus once the menu is on screen (before the next key press arrives).
  const pending = useRef(-1);
  const show = (focus: number) => {
    pending.current = (focus + OPTIONS.length) % OPTIONS.length;
    if (open) items.current[pending.current]?.focus();
    else setOpen(true);
  };
  useLayoutEffect(() => {
    if (open && pending.current >= 0) items.current[pending.current]?.focus();
    pending.current = -1;
  }, [open]);
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const pick = (id: string | null) => {
    close();
    chooseTopic(id);
  };

  // A tap or click anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      show(e.key === 'ArrowDown' ? selected : selected - 1);
    }
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const at = items.current.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => {
      e.preventDefault();
      items.current[(i + OPTIONS.length) % OPTIONS.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(OPTIONS.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') setOpen(false);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation(); // not a swipe
  };

  return (
    <div className="topics" ref={wrap} data-testid="topic-picker">
      <button
        ref={button}
        type="button"
        className="topics-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : show(selected))}
        onKeyDown={onButtonKey}
      >
        <span className="sr-only">Part of the sea: </span>
        <span className="topics-ar" lang="ar" dir="rtl">
          {current.name.ar}
        </span>
        <span className="topics-en">{current.name.en}</span>
        <svg className="topics-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <ul id={menuId} role="menu" className="topics-menu" aria-label="Parts of the sea" onKeyDown={onMenuKey}>
          {OPTIONS.map((o, i) => (
            <li key={o.id ?? 'all'} role="none">
              <button
                ref={(el) => {
                  items.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={o.id === topic}
                tabIndex={-1}
                className="topics-item"
                onClick={() => pick(o.id)}
              >
                <span className="topics-ar" lang="ar" dir="rtl">
                  {o.name.ar}
                </span>
                <span className="topics-en">{o.name.en}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
