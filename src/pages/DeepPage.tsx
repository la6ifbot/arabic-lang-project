import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { nameShapeProblem } from '../../shared/deep';
import { accountsMode } from '../account/backend';
import { friendlyMessage } from '../account/errors';
import { announce, bootAccounts, openAuth, useAccount } from '../account/store';
import { AccountError, type AccountErrorCode, type BoardId, type BoardRow, type DeepBoards, type DeepMe, type DeepScript } from '../account/types';
import { setDeepMember } from '../state/deep';
import { Modal } from '../ui/Modal';
import { PageShell } from './PageShell';
import './deep.css';

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

const TABS: { id: BoardId; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All time' },
];

/** “58 pearls in the deep · 212 depth”, or “+14 depth” for this week. */
function scoreText(board: BoardId, score: number, pearls: number | null) {
  return board === 'week' ? `+${plural(score, 'depth', 'depth')}` : `${plural(pearls ?? 0, 'pearl')} in the deep · ${score.toLocaleString('en')} depth`;
}

/** A name exactly as its diver wrote it, isolated so Arabic and Latin never reorder what's around it. */
const Name = ({ name }: { name: string }) => (
  <bdi dir="auto" className="deep-name">
    {name}
  </bdi>
);

/** The Deep: an opt-in leaderboard of depth earned slowly, in Durar's calm style. */
export default function DeepPage() {
  const status = useAccount((s) => s.status);
  const userId = useAccount((s) => s.user?.id ?? null);
  const [tab, setTab] = useState<BoardId>('week');
  const [boards, setBoards] = useState<DeepBoards | 'error' | null>(null);
  const [me, setMe] = useState<DeepMe | null | undefined>(undefined);
  const [dialog, setDialog] = useState<'join' | 'rename' | 'leave' | null>(null);
  const wantsJoin = useRef(typeof location !== 'undefined' && location.hash === '#join');
  const tabRefs = useRef<Record<BoardId, HTMLButtonElement | null>>({ week: null, all: null });
  const ids = { week: useId(), all: useId() };

  useEffect(() => {
    // Not for search engines (the prerendered /deep page says so too).
    if (document.querySelector('meta[name="robots"]')) return;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const load = useCallback(async () => {
    if (accountsMode === 'off') return;
    const backend = await bootAccounts();
    if (!backend) return;
    try {
      setBoards(await backend.deepBoards());
    } catch {
      setBoards('error');
    }
  }, []);

  const loadMe = useCallback(async () => {
    if (!userId) return setMe(null);
    const backend = await bootAccounts();
    try {
      const m = (await backend?.deepMe()) ?? null;
      setMe(m);
      setDeepMember(m !== null);
      if (!m && wantsJoin.current) setDialog('join');
    } catch {
      setMe(null);
    }
    wantsJoin.current = false;
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (status === 'signed-in') void loadMe();
    else if (status === 'signed-out') setMe(null);
  }, [status, loadMe]);

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? 'week' : e.key === 'End' ? 'all' : tab === 'week' ? 'all' : 'week';
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const done = async (m: DeepMe | null, message: string) => {
    setDialog(null);
    setMe(m);
    setDeepMember(m !== null);
    announce(message);
    await load();
  };

  let body;
  if (accountsMode === 'off') {
    body = <p className="deep-empty">The Deep isn’t open on this site yet.</p>;
  } else if (boards === 'error') {
    body = (
      <p className="deep-empty" role="alert">
        We couldn’t reach the deep just now.{' '}
        <button type="button" className="link-btn" onClick={() => void load()}>
          Try again
        </button>
      </p>
    );
  } else if (!boards) {
    body = <div className="deep-skeleton" aria-hidden="true" />;
  } else {
    const board = boards[tab];
    const mine = me?.[tab] ?? null;
    body = (
      <>
        <div className="deep-tabs" role="tablist" aria-label="Boards" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${ids[t.id]}-tab`}
              aria-selected={tab === t.id}
              aria-controls={`${ids[t.id]}-panel`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <section role="tabpanel" id={`${ids[tab]}-panel`} aria-labelledby={`${ids[tab]}-tab`} className="deep-panel" data-testid={`deep-board-${tab}`}>
          <p className="deep-divers" data-testid="deep-divers">
            {tab === 'week'
              ? board.divers
                ? `${plural(board.divers, 'diver')} went deeper this week`
                : null
              : board.divers
                ? plural(board.divers, 'diver')
                : null}
          </p>
          {board.rows.length === 0 ? (
            <p className="deep-empty" data-testid="deep-empty">
              {tab === 'week'
                ? 'Still water so far this week. Depth gained since Monday shows here.'
                : 'The deep is still quiet. Nobody has dived this far yet.'}
            </p>
          ) : (
            <ol className="deep-list">
              {board.rows.map((r) => (
                <Row key={r.rank} board={tab} row={r} me={mine?.rank === r.rank} />
              ))}
              {mine && mine.rank > board.rows.length && (
                <>
                  <li className="deep-gap" aria-hidden="true">
                    ···
                  </li>
                  <Row board={tab} row={{ rank: mine.rank, name: me!.name, score: mine.score, pearls: me!.all && tab === 'all' ? me!.all.pearls : null }} me />
                </>
              )}
            </ol>
          )}
          {me && (
            <p className="deep-you" data-testid="deep-you">
              {mine
                ? `You’re #${mine.rank} of ${plural(board.divers, 'diver')}.`
                : tab === 'week'
                  ? 'You haven’t gone deeper yet this week. The week starts again each Monday.'
                  : 'You’re not on this board yet. Your depth counts from the next time a word comes back and you still know it.'}
            </p>
          )}
        </section>
      </>
    );
  }

  return (
    <PageShell>
      <h1 className="page-title">
        <span className="page-title-ar" lang="ar" dir="rtl">
          الأَعْمَاق
        </span>
        The Deep
      </h1>
      <p className="deep-lead">
        Divers who chose to be seen, ranked by how deep their pearls have sunk. Depth is earned slowly: a word sinks one
        box deeper only when it comes back and you still know it.
      </p>
      {body}
      {accountsMode !== 'off' && (
        <div className="deep-join" data-testid="deep-join">
          {status === 'signed-in' && me ? (
            <>
              <p>
                You dive as <Name name={me.name} />.
              </p>
              <p className="deep-actions">
                <button type="button" className="link-btn" onClick={() => setDialog('rename')}>
                  Change name
                </button>
                <button type="button" className="link-btn" onClick={() => setDialog('leave')}>
                  Leave The Deep
                </button>
              </p>
            </>
          ) : status === 'signed-in' && me === null ? (
            <>
              <p>Join to see your own rank. Only the name you choose is shown, never your email.</p>
              <button type="button" className="btn btn-primary" onClick={() => setDialog('join')}>
                Join The Deep
              </button>
            </>
          ) : status === 'signed-out' ? (
            <>
              <p>Sign in to join. It’s opt-in: only the name you choose is shown, and you can leave any time.</p>
              <button type="button" className="btn btn-primary" onClick={() => openAuth('signin')}>
                Sign in to join
              </button>
            </>
          ) : null}
        </div>
      )}
      <p className="deep-note">The boards update every 15 minutes. No notifications and no badges: just the sea.</p>
      {(dialog === 'join' || dialog === 'rename') && (
        <NameDialog
          mode={dialog}
          current={me ?? null}
          onClose={() => setDialog(null)}
          onDone={(m) => void done(m, dialog === 'join' ? `You’ve joined The Deep as ${m.name}.` : `Your name on The Deep is now ${m.name}.`)}
        />
      )}
      {dialog === 'leave' && <LeaveDialog onClose={() => setDialog(null)} onDone={() => void done(null, 'You’ve left The Deep. Your name is no longer shown.')} />}
    </PageShell>
  );
}

function Row({ board, row, me }: { board: BoardId; row: BoardRow; me: boolean }) {
  return (
    <li className="deep-row" data-me={me || undefined} aria-current={me ? 'true' : undefined}>
      <span className="deep-rank">
        <span className="sr-only">Rank </span>
        {row.rank}
      </span>
      <span className="deep-who">
        <Name name={row.name} />
        {me && <span className="deep-you-tag"> (you)</span>}
      </span>
      <span className="deep-score">{scoreText(board, row.score, row.pearls)}</span>
    </li>
  );
}

type Choice = 'own' | DeepScript;

function NameDialog({ mode, current, onClose, onDone }: { mode: 'join' | 'rename'; current: DeepMe | null; onClose: () => void; onDone: (m: DeepMe) => void }) {
  const [choice, setChoice] = useState<Choice>('own');
  const [name, setName] = useState(mode === 'rename' && current && !current.generated ? current.name : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const descId = useId();
  const errorId = useId();
  const tooSoon = mode === 'rename' && current?.nextRenameAt ? new Date(current.nextRenameAt) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (choice === 'own') {
      const problem = nameShapeProblem(name);
      if (problem) return setError(friendlyMessage(new AccountError(`name_${problem}` as AccountErrorCode)));
    }
    setBusy(true);
    try {
      const backend = await bootAccounts();
      if (!backend) throw new AccountError('not_configured');
      const n = choice === 'own' ? name : null;
      const script: DeepScript = choice === 'arabic' ? 'arabic' : 'latin';
      onDone(mode === 'join' ? await backend.deepJoin(n, script) : await backend.deepRename(n, script));
    } catch (err) {
      setError(friendlyMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal labelledBy={titleId} describedBy={descId} onClose={onClose} className="confirm-modal deep-dialog">
      <h2 id={titleId} className="modal-title">
        {mode === 'join' ? 'Join The Deep' : 'Change your name'}
      </h2>
      <p id={descId} className="modal-text">
        Everyone can see this name with your rank and depth. Nothing else: never your email or your words. You can change
        the name once a day, or leave at any time.
      </p>
      {tooSoon ? (
        <>
          <p className="modal-text" role="status">
            You can change your name again {tooSoon.toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={onClose} data-autofocus>
              OK
            </button>
          </div>
        </>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <fieldset className="deep-choices">
            <legend>Your name on the board</legend>
            <label>
              <input type="radio" name="deep-name" checked={choice === 'own'} onChange={() => setChoice('own')} data-autofocus />
              Choose a name
            </label>
            {choice === 'own' && (
              <div className="field">
                <label htmlFor="deep-name-input">Name</label>
                <input
                  id="deep-name-input"
                  dir="auto"
                  autoComplete="nickname"
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : `${errorId}-hint`}
                />
                <span className="field-hint" id={`${errorId}-hint`}>
                  3 to 20 letters, in Latin or Arabic.
                </span>
              </div>
            )}
            <label>
              <input type="radio" name="deep-name" checked={choice === 'latin'} onChange={() => setChoice('latin')} />
              Give me one, like “Diver 142”
            </label>
            <label>
              <input type="radio" name="deep-name" checked={choice === 'arabic'} onChange={() => setChoice('arabic')} />
              <span>
                Give me one in Arabic, like{' '}
                <span lang="ar" dir="rtl">
                  «غوّاص ١٤٢»
                </span>
              </span>
            </label>
          </fieldset>
          {error && (
            <div className="form-error" role="alert" id={errorId}>
              <p>{error}</p>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
              {busy ? 'One moment…' : mode === 'join' ? 'Join' : 'Save name'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function LeaveDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();
  const leave = async () => {
    setBusy(true);
    try {
      await (await bootAccounts())?.deepLeave();
      onDone();
    } catch (e) {
      setError(friendlyMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal labelledBy={titleId} describedBy={descId} onClose={onClose} className="confirm-modal">
      <h2 id={titleId} className="modal-title">
        Leave The Deep?
      </h2>
      <p id={descId} className="modal-text">
        Your name disappears from both boards at once. Your progress stays, and you can join again later.
      </p>
      {error && (
        <div className="form-error" role="alert">
          <p>{error}</p>
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-quiet" onClick={onClose} data-autofocus disabled={busy}>
          Stay
        </button>
        <button type="button" className="btn btn-danger" onClick={() => void leave()} disabled={busy} aria-busy={busy}>
          {busy ? 'Leaving…' : 'Leave'}
        </button>
      </div>
    </Modal>
  );
}
