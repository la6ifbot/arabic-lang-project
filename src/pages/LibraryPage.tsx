import { useEffect, useMemo, useRef, useState } from 'react';
import { daysUntilDue, type Progress } from '../../shared/mastery';
import { accountsMode } from '../account/backend';
import { openAuth, removePearl, restorePearl, useAccount } from '../account/store';
import { linkHandler } from '../lib/router';
import { normalizeArabic, WORD_BY_SLUG } from '../lib/words';
import { openResetProgress } from '../state/dialogs';
import { progressLabel, startProgress, useProgress } from '../state/progress';
import { useDurar } from '../state/store';
import type { Word } from '../types';
import { PageShell } from './PageShell';

type Sort = 'newest' | 'alpha';
type Filter = 'all' | 'saved' | 'learning' | 'deep';
const SORT_KEY = 'durar-library-sort';
const UNDO_MS = 7000;
const collator = new Intl.Collator('ar');

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'saved', label: 'Saved' },
  { id: 'learning', label: 'Still learning' },
  { id: 'deep', label: 'In the deep' },
];

function readSort(): Sort {
  try {
    return localStorage.getItem(SORT_KEY) === 'alpha' ? 'alpha' : 'newest';
  } catch {
    return 'newest';
  }
}

interface Item {
  word: Word;
  savedAt?: string;
  progress?: Progress;
  /** Latest of saved / last reviewed, for “Newest”. */
  at: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function returnsText(p: Progress, now: number) {
  const d = daysUntilDue(p, now);
  return d === 0 ? 'due now' : d === 1 ? 'returns tomorrow' : `returns in ${d} days`;
}

/** Five small pearls, filled up to the word's box. The text next to it says the same in words. */
function Depth({ p }: { p: Progress }) {
  return (
    <span className="lib-depth" data-box={p.box}>
      <span className="lib-depth-dots" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((b) => (
          <span key={b} data-on={b <= p.box || undefined} />
        ))}
      </span>
      <span className="lib-depth-text">{progressLabel(p)}</span>
    </span>
  );
}

/** My Pearls: saved pearls plus every word you've swiped, with how deep each one has sunk. */
export default function LibraryPage() {
  const status = useAccount((s) => s.status);
  const saved = useAccount((s) => s.saved);
  const savedLoaded = useAccount((s) => s.savedLoaded);
  const progress = useProgress((s) => s.map);
  const progressLoaded = useProgress((s) => s.loaded);
  const [sort, setSort] = useState<Sort>(readSort);
  const [filter, setFilter] = useState<Filter>('all');
  const [undo, setUndo] = useState<{ word: Word; savedAt: string; id: number } | null>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const signedIn = status === 'signed-in';

  useEffect(() => {
    void startProgress();
  }, []);

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

  const items = useMemo(() => {
    // Words that no longer exist in the dataset (renamed, retired) are skipped quietly.
    const slugs = new Set([...Object.keys(signedIn ? saved : {}), ...Object.keys(progress)]);
    const list: Item[] = [];
    for (const slug of slugs) {
      const word = WORD_BY_SLUG.get(slug);
      if (!word) continue;
      const savedAt = signedIn ? saved[slug] : undefined;
      const p = progress[slug];
      const at = [savedAt ?? '', p?.lastReviewedAt ?? ''].sort().at(-1)!;
      list.push({ word, savedAt, progress: p, at });
    }
    return sort === 'newest'
      ? list.sort((a, b) => b.at.localeCompare(a.at))
      : list.sort((a, b) => collator.compare(normalizeArabic(a.word.ar), normalizeArabic(b.word.ar)));
  }, [saved, progress, sort, signedIn]);

  const counts = useMemo(
    () => ({
      deep: items.filter((i) => (i.progress?.box ?? 0) >= 2).length,
      learning: items.filter((i) => i.progress?.box === 1).length,
      saved: items.filter((i) => i.savedAt).length,
    }),
    [items],
  );

  const shown = items.filter((i) =>
    filter === 'saved'
      ? i.savedAt
      : filter === 'learning'
        ? i.progress?.box === 1
        : filter === 'deep'
          ? (i.progress?.box ?? 0) >= 2
          : true,
  );

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
  const now = Date.now();
  const loading = status === 'loading' || (signedIn && !savedLoaded) || !progressLoaded;

  const dive = (
    <a className="btn btn-primary" href="/" onClick={linkHandler('/')}>
      Dive in
    </a>
  );
  const signInButton = (
    <button type="button" className="btn btn-primary" onClick={() => openAuth('signin')}>
      Sign in
    </button>
  );

  const empty: Record<Filter, React.ReactNode> = {
    all: (
      <>
        <p className="lib-empty-lead">No pearls yet.</p>
        <p>Dive in. Every word you swipe finds its place here, and the ones you keep shine a little brighter.</p>
        {dive}
      </>
    ),
    saved:
      signedIn || accountsMode === 'off' ? (
        <>
          <p className="lib-empty-lead">No saved pearls yet.</p>
          <p>Tap the pearl on a card to keep a word here.</p>
          {dive}
        </>
      ) : (
        <>
          <p className="lib-empty-lead">Your saved pearls live here.</p>
          <p>Sign in to keep the words that stay with you, on any device.</p>
          {signInButton}
        </>
      ),
    learning: (
      <>
        <p className="lib-empty-lead">Nothing still learning.</p>
        <p>Words you swipe left stay near the light, here, until they settle.</p>
      </>
    ),
    deep: (
      <>
        <p className="lib-empty-lead">Nothing in the deep yet.</p>
        <p>Words you know sink here, a little deeper each time they come back to you.</p>
      </>
    ),
  };

  let body: React.ReactNode;
  if (loading) {
    body = (
      <ul className="lib-grid" aria-busy="true" aria-label="Loading your pearls">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="lib-skeleton" />
        ))}
      </ul>
    );
  } else {
    body = (
      <>
        {!signedIn && accountsMode !== 'off' && (
          <div className="lib-guest" data-testid="library-signed-out">
            <p>Your progress is kept in this browser only. Sign in to save pearls and carry your progress to any device.</p>
            {signInButton}
          </div>
        )}
        {items.length > 0 && (
          <>
            <p className="lib-count" data-testid="library-count">
              {counts.deep} in the deep · {counts.learning} still learning · {counts.saved} saved
            </p>
            <div className="lib-bar">
              <div className="lib-sort lib-filter" role="group" aria-label="Show">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>
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
          </>
        )}
        {shown.length === 0 ? (
          <div className="lib-empty" data-testid={`library-empty-${filter}`}>
            {empty[filter]}
          </div>
        ) : (
          <ul className="lib-grid" data-testid="library-list" aria-label={`${FILTERS.find((f) => f.id === filter)!.label}: ${plural(shown.length, 'word')}`}>
            {shown.map(({ word, savedAt, progress: p }) => (
              <li key={word.slug} className="lib-pearl" data-saved={savedAt ? true : undefined} data-box={p?.box}>
                <a className="lib-link" href={`/word/${word.slug}`} onClick={linkHandler(`/word/${word.slug}`)} data-slug={word.slug}>
                  <span className="lib-ar" lang="ar" dir="rtl">
                    {word.ar}
                  </span>
                  <span className="lib-tr">{word.translit}</span>
                  <span className="lib-en">{word.meanings[0]}</span>
                  {(p || savedAt) && (
                    <span className="lib-meta">
                      {p && <Depth p={p} />}
                      {p && <span className="lib-due">{returnsText(p, now)}</span>}
                      {savedAt && <span className="lib-saved">Saved</span>}
                    </span>
                  )}
                </a>
                {savedAt && (
                  <button
                    type="button"
                    className="lib-remove"
                    onClick={() => void remove(word)}
                    aria-label={`Remove ${word.ar} (${word.translit}) from My Pearls`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {Object.keys(progress).length > 0 && (
          <p className="lib-reset">
            <button type="button" className="link-btn" onClick={openResetProgress} data-testid="library-reset">
              Reset my progress…
            </button>
          </p>
        )}
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
