import type { Quality } from '../scene/Experience';


/**
 * Cheap capability check. Creating a throwaway context to probe costs 50–500 ms on weak devices,
 * so an actual context-creation failure is instead caught by the scene's error boundary.
 */
export function mayHaveWebGL2(): boolean {
  return typeof window !== 'undefined' && 'WebGL2RenderingContext' in window;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function pickQuality(): Quality {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const cores = navigator.hardwareConcurrency ?? 4;
  const low = coarse || small || cores <= 4;
  return {
    // Full sharpness up to 2× on every device: the card text lives in the 3D canvas, so a lower
    // resolution blurs it. (Particles and card count are what lighter devices give up instead.)
    maxDpr: Math.min(window.devicePixelRatio || 1, 2),
    particles: low ? 550 : 1400,
    visibleCards: low ? 7 : 10,
  };
}
