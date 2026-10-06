/**
 * DOM elements the 3D scene positions every frame. Kept in a tiny, three-free module so the 2D
 * chrome can register them without pulling the scene chunk into the main bundle.
 */
export const saveAnchor: { el: HTMLElement | null } = { el: null };

/** Where the focused 3D card's headword is on screen (CSS px): the anatomy layer opens over it. */
export const headAnchor = { x: 0, y: 0, visible: false };
