import { useEffect, useRef } from 'react';
import { copyLink, download, isToday } from '../share/share';
import { whatsappUrl } from '../share/text';
import type { Word } from '../types';

/**
 * The desktop share menu (and the fallback where a phone has no share sheet): WhatsApp, Copy
 * link, Download image. A proper menu: arrows, Home/End, Escape returns focus to Share.
 */
export default function ShareMenu({
  id,
  word,
  open,
  anchor,
  close,
  note,
  busyWhile,
}: {
  id: string;
  word: Word;
  open: boolean;
  anchor: React.RefObject<HTMLButtonElement | null>;
  close: (refocus: boolean) => void;
  note: (text: string) => void;
  busyWhile: <T>(task: Promise<T>) => Promise<T>;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !anchor.current?.contains(t)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === 'Tab') return close(false);
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
    // Keep the page's own keys (arrows swipe, S saves) out of the menu.
    e.stopPropagation();
  };

  return (
    <div ref={menu} id={id} role="menu" aria-label={`Share ${word.ar}`} className="acct-menu share-menu" onKeyDown={onKeyDown}>
      <a
        role="menuitem"
        className="acct-item"
        href={whatsappUrl(word, { today: isToday(word) })}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => close(true)}
        data-testid="share-whatsapp"
      >
        WhatsApp
      </a>
      <button
        type="button"
        role="menuitem"
        className="acct-item"
        onClick={() => {
          close(true);
          void copyLink(word).then((ok) => note(ok ? 'Link copied' : 'Couldn’t copy the link'));
        }}
        data-testid="share-copy"
      >
        Copy link
      </button>
      <button
        type="button"
        role="menuitem"
        className="acct-item"
        onClick={() => {
          close(true);
          busyWhile(download(word)).catch(() => note('Couldn’t make the image. Please try again.'));
        }}
        data-testid="share-download"
      >
        Download image
      </button>
    </div>
  );
}
