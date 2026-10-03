import { useEffect, useState } from 'react';
import { TOPIC_BY_ID } from '../lib/topics';
import { useProgress } from '../state/progress';
import { useDurar } from '../state/store';
import { chooseTopic } from '../state/topic';

export const MET_ALL = 'You’ve met every pearl for now. The sea will bring some back soon.';

/**
 * What a swipe did (“Marked known · returns in 3 days”): announced politely, and shown for a moment
 * as a faint caption above the controls. Also the calm note when nothing is new or due.
 */
export function ProgressNote() {
  const note = useProgress((s) => s.note);
  const metAll = useProgress((s) => s.metAll);
  const loaded = useProgress((s) => s.loaded);
  const topic = useDurar((s) => (s.topic ? TOPIC_BY_ID.get(s.topic) : undefined));
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!note.id) return;
    setShown(true);
    const id = window.setTimeout(() => setShown(false), 2600);
    return () => window.clearTimeout(id);
  }, [note.id]);

  return (
    <div className="progress-note" data-progress={loaded ? 'ready' : 'loading'} data-testid="progress-note">
      {metAll && !topic && (
        <p className="met-all" role="status" data-testid="met-all">
          {MET_ALL}
        </p>
      )}
      {metAll && topic && (
        <p className="met-all" role="status" data-testid="met-all">
          Nothing new or due in {topic.name.en} for now.{' '}
          <button type="button" className="met-all-link" onClick={() => chooseTopic(null)}>
            Swim in the whole sea
          </button>
        </p>
      )}
      <p className="progress-caption" aria-hidden="true" data-shown={shown || undefined}>
        {note.text}
      </p>
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="progress-status">
        <span key={note.id}>{note.text}</span>
      </div>
    </div>
  );
}
