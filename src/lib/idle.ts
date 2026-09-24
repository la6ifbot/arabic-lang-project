/** Runs `fn` when the browser is idle (or soon, where requestIdleCallback is missing). */
export const whenIdle = (fn: () => void): number =>
  typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 2500 }) : window.setTimeout(fn, 400);

export const cancelIdle = (id: number) =>
  typeof window.cancelIdleCallback === 'function' ? window.cancelIdleCallback(id) : window.clearTimeout(id);
