import { emailSignupEnabled } from '../lib/flags';
import { TODAY } from '../lib/words';
import { openSubscribe } from '../state/dialogs';
import { useDurar } from '../state/store';

/** “دُرَّةُ اليَوْم · Pearl of the Day”, shown while today's pearl is the focused card. */
export function PearlLabel({ className = '' }: { className?: string }) {
  const focused = useDurar((s) => s.order[0]);
  if (focused !== TODAY.slug) return null;
  return (
    <div className={`potd ${className}`} data-testid="pearl-of-the-day">
      <p className="potd-label">
        <span lang="ar" dir="rtl">
          دُرَّةُ اليَوْم
        </span>
        <span aria-hidden="true"> · </span>
        <span>Pearl of the Day</span>
      </p>
      {emailSignupEnabled && (
        <button type="button" className="potd-sub" onClick={openSubscribe} data-testid="subscribe-open">
          Get the Pearl of the Day by email
        </button>
      )}
    </div>
  );
}
