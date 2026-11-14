/**
 * DOM elements the 3D scene positions every frame. Kept in a tiny, three-free module so the 2D
 * chrome can register them without pulling the scene chunk into the main bundle.
 */
export const saveAnchor: { el: HTMLElement | null } = { el: null };

/** The sharp 2D copy of the focused card's text, laid over the 3D card (src/scene/CrispText.tsx). */
export const crispText: { el: HTMLCanvasElement | null } = { el: null };

/** Where the focused 3D card's headword is on screen (CSS px): the anatomy layer opens over it. */
export const headAnchor = { x: 0, y: 0, visible: false };

/**
 * The free rectangle the focused 3D card fits into (CSS px, from the stage's edges): below the top
 * controls, above the card's own button row and the swipe controls, inside the safe area (notch,
 * rounded corners, browser bars). Measured from the real controls (src/ui/useCardZone.ts), so it
 * follows the phone's text size, rotation and the browser bars; `ready` is false until then.
 */
export const cardZone = { ready: false, width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0, rowWidth: 0, version: 0 };
