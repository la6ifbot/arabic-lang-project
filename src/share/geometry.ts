/**
 * Geometry of the shareable story image (Instagram/WhatsApp Stories, 9:16). No imports, so tests
 * can read it too.
 */
export const STORY = { width: 1080, height: 1920 } as const;

/**
 * Instagram draws its own UI over roughly the top 14% (progress bar, name) and bottom 20% (reply
 * bar) of a story. The whole card, and so the signature, sits between these lines.
 */
export const SAFE = { top: Math.round(STORY.height * 0.14), bottom: Math.round(STORY.height * 0.8) } as const;

/** The pearl card, 0.7 wide:tall like the cards in the sea, centred in the safe area. */
const CARD_W = 880;
const CARD_H = Math.round(CARD_W / 0.7);
export const CARD = {
  x: (STORY.width - CARD_W) / 2,
  y: Math.round((SAFE.top + SAFE.bottom - CARD_H) / 2),
  w: CARD_W,
  h: CARD_H,
  r: 44,
} as const;

/**
 * Where the signature is drawn (bottom-right of the card, like an artist's signature). The text
 * layout never enters this box, so its pixels are the same on every image.
 */
export const SIGNATURE_BOX = { x: CARD.x + CARD.w - 400, y: CARD.y + CARD.h - 150, w: 370, h: 124 } as const;

/** Where the word's text may go: inside the card, above the signature. */
export const CONTENT = {
  top: CARD.y + 84,
  bottom: SIGNATURE_BOX.y - 20,
  maxWidth: Math.round(CARD.w * 0.8),
  headWidth: Math.round(CARD.w * 0.84),
} as const;
