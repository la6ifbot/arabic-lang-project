import { createHash } from 'node:crypto';

/**
 * Card images (social previews and the daily email) live on img.durar.space: a private S3 bucket in
 * Frankfurt behind CloudFront. CI renders and uploads them (scripts/cards.mjs --upload); nothing is
 * committed. Each file name carries a hash of everything drawn on the card, so a word's URL can be
 * worked out from its data alone, a changed word gets a new URL, and every file can be cached forever.
 */
export const IMAGE_ORIGIN = 'https://img.durar.space';
export const IMAGE_BUCKET = 'durar-space-images';
export const IMAGE_REGION = 'eu-central-1';

/** Bump when the card template changes, to re-render every card under new names. */
export const CARD_TEMPLATE_VERSION = 5;

export const CARD_SIZES = {
  og: { width: 1200, height: 630, scale: 1 },
  email: { width: 600, height: 340, scale: 2 },
} as const;
export type CardKind = keyof typeof CARD_SIZES;
export const CARD_KINDS = Object.keys(CARD_SIZES) as CardKind[];

/** The fields a card draws. */
export interface CardWord {
  slug: string;
  ar: string;
  translit: string;
  meanings: string[];
}

/** The general Durar card, used for the home page and pages without a word. */
export const HOME_CARD = 'durar';

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export function cardHash(w: CardWord | typeof HOME_CARD): string {
  if (w === HOME_CARD) return sha(`home:${CARD_TEMPLATE_VERSION}`);
  return sha(JSON.stringify([CARD_TEMPLATE_VERSION, w.slug, w.ar, w.translit, w.meanings[0]]));
}

const slugOf = (w: CardWord | typeof HOME_CARD) => (w === HOME_CARD ? HOME_CARD : w.slug);

/** Immutable, content-hashed object key, e.g. `cards/og/bahr-a60d7be54c8c7b0e.png`. */
export const cardKey = (kind: CardKind, w: CardWord | typeof HOME_CARD) => `cards/${kind}/${slugOf(w)}-${cardHash(w)}.png`;

/**
 * Stable object key holding the latest version, e.g. `cards/og/bahr.png`. Only for links made before the
 * images moved (old emails, cached link previews): durar.space/cards/* redirects here.
 */
export const cardStableKey = (kind: CardKind, w: CardWord | typeof HOME_CARD) => `cards/${kind}/${slugOf(w)}.png`;

/** The public URL of a word's card image. */
export const cardUrl = (kind: CardKind, w: CardWord | typeof HOME_CARD) => `${IMAGE_ORIGIN}/${cardKey(kind, w)}`;

/** Alt text used for og:image:alt, twitter:image:alt and the email <img>. */
export const cardAlt = (w: CardWord) => `${w.ar} (${w.translit}): ${w.meanings[0]}`;
