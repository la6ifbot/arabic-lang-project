import { useVoiceModule } from '../lib/voiceLoader';
import { AnatomyButton } from './AnatomyButton';
import { SaveButton } from './SaveButton';
import { ShareButton } from './ShareButton';

/**
 * The focused card's controls. Over the 3D card (`speakers`) they are one centred row just below the
 * card (src/scene/SaveAnchor.tsx): Listen (word, sentence, 0.75×), Letters, Share and the save pearl,
 * since the card's text is drawn in the scene. The text-only card has its speakers beside the text
 * instead, and these three top-right.
 */
export function CardActions({ slug, className = '', speakers = false }: { slug: string; className?: string; speakers?: boolean }) {
  const voice = useVoiceModule();
  return (
    <div className={`card-actions ${className}`}>
      {speakers && voice && <voice.Listen slug={slug} />}
      <AnatomyButton slug={slug} />
      <ShareButton slug={slug} />
      <SaveButton slug={slug} />
    </div>
  );
}
