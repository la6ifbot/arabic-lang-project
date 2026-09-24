import { SaveButton } from './SaveButton';
import { ShareButton } from './ShareButton';

/** The focused card's controls, top-right: Share, then the save pearl in the corner. */
export function CardActions({ slug, className = '' }: { slug: string; className?: string }) {
  return (
    <div className={`card-actions ${className}`}>
      <ShareButton slug={slug} />
      <SaveButton slug={slug} />
    </div>
  );
}
