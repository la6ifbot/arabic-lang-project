import { useEffect, useMemo, useRef, useState } from 'react';
import { accountsMode } from '../account/backend';
import { openAuth, removePearl, restorePearl, useAccount } from '../account/store';
import { linkHandler } from '../lib/router';
import { normalizeArabic, WORD_BY_SLUG } from '../lib/words';
import { useDurar } from '../state/store';
import type { Word } from '../types';
import { PageShell } from './PageShell';

type Sort = 'newest' | 'alpha';
const SORT_KEY = 'durar-library-sort';
const UNDO_MS = 7000;
const collator = new Intl.Collator('ar');

function readSort(): Sort {
  try {
    return localStorage.getItem(SORT_KEY) === 'alpha' ? 'alpha' : 'newest';
  } catch {
    return 'newest';
  }
}

/** My Pearls: the words a signed-in visitor has kept, as small pearl cards. */
export default function LibraryPage() {
  const status = useAccount((s) => s.status);
  const saved = useAccount((s) => s.saved);
  const loaded = useAccount((s) => s.savedLoaded);
  const [sort, setSort] = useState<Sort>(readSort);
  const [undo, setUndo] = useState<{ word: Word; savedAt: string; id: number } | null>(null);
  const undoButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Personal pages stay out of search engines. The prerendered /library HTML already says so;
    // add the tag when arriving here from inside the app.
    if (document.querySelector('meta[name="robots"]')) return;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    if (!undo) return;
    undoButton.current?.focus();
    const t = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [undo]);

  const pearls = useMemo(() => {
    // Words that no longer exist in the dataset (renamed, retired) are skipped quietly.
    const list = Object.entries(saved)
      .filter(([slug]) => WORD_BY_SLUG.has(slug))
      .map(([slug, savedAt]) => ({ word: WORD_BY_SLUG.get(slug)!, savedAt }));
    return sort === 'newest'
      ? list.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      : list.sort((a, b) => collator.compare(normalizeArabic(a.word.ar), normalizeArabic(b.word.ar)));
  }, [saved, sort]);

  const chooseSort = (s: Sort) => {
    setSort(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {
      /* per-visitor convenience only */
    }
  };

  const remove = async (word: Word) => {
    const savedAt = await removePearl(word.slug);
    if (savedAt) setUndo({ word, savedAt, id: Date.now() });
  };

  const backTo = `/word/${useDurar.getState().order[0]}`;
  const n = pearls.length;

  let body: React.ReactNode;
  if (accountsMode === 'off') {
    body = (
      <div className="lib-empty">
        <p>Accounts aren’t available on this site yet, so there’s nowhere to keep pearls.</p>
        <a className="btn btn-primary" href="/" onClick={linkHandler('/')}>
          Back to the sea
        </a>
      </div>
    );
  } else if (status === 'loading' || (status === 'signed-in' && !loaded)) {
    body = (
      <ul className="lib-grid" aria-busy="true" aria-label="Loading your pearls">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="lib-skeleton" />
        ))}
      </ul>
    );
  } else if (status !== 'signed-in') {
    body = (
      <div className="lib-empty" data-testid="library-signed-out">
        <p className="lib-empty-lead">Your pearls live here.</p>
        <p>Sign in to see the words you’ve kept, on any device.</p>
        <button type="button" className="btn btn-primary" onClick={() => openAuth('signin')}>
          Sign in
        </button>
      </div>
    );
  } else if (n === 0) {
    body = (
      <div className="lib-empty" data-testid="library-empty">
        <p className="lib-empty-lead">No pearls yet.</p>
        <p>Dive in and keep the ones that stay with you.</p>
        <a className="btn btn-primary" href="/" onClick={linkHandler('/')}>
          Dive in
        </a>
      </div>
    );
  } else {
    body = (
      <>
        <div className="lib-bar">
          <p className="lib-count" data-testid="library-count">
            {n === 1 ? '1 pearl' : `${n} pearls`}
          </p>
          <div className="lib-sort" role="group" aria-label="Sort pearls">
            <button type="button" aria-pressed={sort === 'newest'} onClick={() => chooseSort('newest')}>
              Newest
            </button>
            <button type="button" aria-pressed={sort === 'alpha'} onClick={() => chooseSort('alpha')}>
              Alphabetical{' '}
              <span lang="ar" dir="rtl">
                أ–ي
              </span>
            </button>
          </div>
        </div>
        <ul className="lib-grid" data-testid="library-list">
          {pearls.map(({ word }) => (
            <li key={word.slug} className="lib-pearl">
              <a className="lib-link" href={`/word/${word.slug}`} onClick={linkHandler(`/word/${word.slug}`)} data-slug={word.slug}>
                <span className="lib-ar" lang="ar" dir="rtl">
                  {word.ar}
                </span>
                <span className="lib-tr">{word.translit}</span>
                <span className="lib-en">{word.meanings[0]}</span>
              </a>
              <button type="button" className="lib-remove" onClick={() => void remove(word)} aria-label={`Remove ${word.ar} (${word.translit}) from My Pearls`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <PageShell back={backTo}>
      <h1 className="page-title">
        <span className="page-title-ar" lang="ar" dir="rtl">
          دُرَرِي
        </span>
        My Pearls
      </h1>
      {body}
      {undo && (
        <div className="undo-bar" key={undo.id}>
          <p>
            Removed{' '}
            <span lang="ar" dir="rtl">
              {undo.word.ar}
            </span>
            .
          </p>
          <button
            ref={undoButton}
            type="button"
            className="link-btn"
            onClick={() => {
              void restorePearl(undo.word.slug, undo.savedAt);
              setUndo(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </PageShell>
  );
}
