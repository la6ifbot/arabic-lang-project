import { useVoiceModule } from '../lib/voiceLoader';
import { AnatomyButton } from './AnatomyButton';
import { SaveButton } from './SaveButton';
import { ShareButton } from './ShareButton';

/**
 * The focused card's controls, top-right: Letters, Share, then the save pearl in the corner. Over the
 * 3D card (`speakers`), the word and first sentence speakers come first, since the card's text is
 * drawn in the scene; the text-only card has them beside the text instead.
 */
export function CardActions({ slug, className = '', speakers = false }: { slug: string; className?: string; speakers?: boolean }) {
  return (
    <div className={`card-actions ${className}`}>
      {speakers && <Speakers slug={slug} />}
      <AnatomyButton slug={slug} />
      <ShareButton slug={slug} />
      <SaveButton slug={slug} />
    </div>
  );
}

function Speakers({ slug }: { slug: string }) {
  const voice = useVoiceModule();
  if (!voice) return null;
  return (
    <>
      <voice.Speaker slug={slug} />
      <voice.Speaker slug={slug} example={0} what="the example sentence" />
    </>
  );
}
