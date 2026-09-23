/**
 * DOM elements the 3D scene positions every frame. Kept in a tiny, three-free module so the 2D
 * chrome can register them without pulling the scene chunk into the main bundle.
 */
export const saveAnchor: { el: HTMLElement | null } = { el: null };
