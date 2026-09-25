import { WORD_BY_SLUG } from '../lib/words';
import { progressLabel, useProgress } from '../state/progress';
import { useDurar } from '../state/store';
import { WordDetails } from './WordDetails';

/** Screen-reader (and crawler) mirror of the focused 3D card; announced politely on change. */
export function Announcer() {
  const slug = useDurar((s) => s.order[0]);
  const word = WORD_BY_SLUG.get(slug)!;
  const label = useProgress((s) => progressLabel(s.map[slug]));
  return (
    <article className="sr-only" aria-live="polite" aria-atomic="true" data-testid="focused-word" data-slug={slug}>
      <WordDetails word={word} headingLevel={1} />
      {label && <p data-testid="focused-depth">{label}</p>}
    </article>
  );
}
