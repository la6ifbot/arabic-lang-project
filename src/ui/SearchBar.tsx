import { useId, useMemo, useRef, useState } from 'react';
import { searchWords } from '../lib/words';
import { useDurar } from '../state/store';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => searchWords(query), [query]);
  const showList = open && query.trim().length > 0;

  const choose = (slug: string) => {
    useDurar.getState().surface(slug);
    setQuery('');
    setOpen(false);
    input.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      const pick = results[active] ?? results[0];
      if (pick) {
        e.preventDefault();
        choose(pick.slug);
      }
    } else if (e.key === 'Escape') {
      if (query) setQuery('');
      else input.current?.blur();
      setOpen(false);
    }
  };

  return (
    <div className="search" role="search">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search for a word in Arabic, transliteration or English
      </label>
      <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M15.5 15.5 20 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        ref={input}
        id={`${listId}-input`}
        type="search"
        dir="auto"
        autoComplete="off"
        spellCheck={false}
        placeholder="ابحث · search"
        value={query}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${results[active].slug}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      <kbd className="search-kbd" aria-hidden="true">
        /
      </kbd>
      {showList && (
        <ul id={listId} role="listbox" className="search-list" aria-label="Suggestions">
          {results.length === 0 && <li className="search-empty">No pearl by that name — yet.</li>}
          {results.map((w, i) => (
            <li
              key={w.slug}
              id={`${listId}-${w.slug}`}
              role="option"
              aria-selected={i === active}
              className="search-option"
              data-active={i === active || undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(w.slug);
              }}
            >
              <span className="search-ar" lang="ar" dir="rtl">
                {w.ar}
              </span>
              <span className="search-meta">
                <span className="search-tr">{w.translit}</span>
                <span className="search-en">{w.meanings[0]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
