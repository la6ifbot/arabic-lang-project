import { useEffect } from 'react';
import { CARD_ASPECT } from '../lib/cardTexture';
import { cardZone } from '../state/anchors';

/** Space between the card and the controls around it, and between the card and its button row. */
const GAP = 12;
const ROW_GAP = 8;
/** Never closer than this to the screen's sides (inside the safe area). */
const SIDE = 14;

/** The top controls whose bottom edge the card stays under (only where they reach its column). */
const TOP = ['.corner-left', '.search input', '.topics-button', '.potd'];
/** The bottom controls whose top edge the card's button row stays above. */
const BOTTOM = ['.controls', '.view-toggles'];

/**
 * Measures `cardZone` (src/state/anchors.ts): the rectangle the focused 3D card fits into, centred,
 * with even margins. Re-measured whenever the screen, the browser bars, the safe area, the text
 * size or any of the controls around the card change size.
 */
export function useCardZone(enabled: boolean) {
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.app');
    if (!enabled || !app) return;
    const probe = document.createElement('div');
    probe.className = 'safe-probe';
    probe.setAttribute('aria-hidden', 'true');
    app.appendChild(probe);

    const visible = (sel: string) =>
      [...app.querySelectorAll<HTMLElement>(sel)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);

    let raf = 0;
    const measure = () => {
      raf = 0;
      const width = app.clientWidth;
      const height = app.clientHeight;
      const safe = getComputedStyle(probe);
      const inset = (side: string) => parseFloat(safe.getPropertyValue(`padding-${side}`)) || 0;
      const left = inset('left') + SIDE;
      const right = inset('right') + SIDE;
      const cx = (left + width - right) / 2;
      const row = app.querySelector<HTMLElement>('.save-anchor .card-actions');
      const rowH = Math.max(44, row?.offsetHeight ?? 0);
      const rowW = Math.max(4 * 46, row?.offsetWidth ?? 0);

      const tops = visible(TOP.join(','));
      const bottoms = visible(BOTTOM.join(','));
      // The card's height decides its width, and its width which controls are in its way, so settle it
      // in a few rounds (it converges at once in practice).
      let top = inset('top') + GAP;
      let bottom = height - inset('bottom') - GAP;
      for (let i = 0; i < 4; i++) {
        const cardW = Math.min(width - left - right, (bottom - top - rowH - ROW_GAP) * CARD_ASPECT);
        const half = Math.max(cardW, rowW) / 2 + GAP;
        const inColumn = (r: DOMRect) => r.right > cx - half && r.left < cx + half;
        top = Math.max(inset('top') + GAP, ...tops.filter(inColumn).map((r) => r.bottom + GAP));
        bottom = Math.min(height - inset('bottom') - GAP, ...bottoms.filter(inColumn).map((r) => r.top - GAP));
      }
      Object.assign(cardZone, {
        ready: true,
        width,
        height,
        top,
        bottom: bottom - rowH - ROW_GAP,
        left,
        right,
        rowWidth: row?.offsetWidth ?? 0,
        version: cardZone.version + 1,
      });
      app.dataset.zone = `${Math.round(top)},${Math.round(bottom - rowH - ROW_GAP)}`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(app);
    const watched = () => app.querySelectorAll<HTMLElement>([...TOP, ...BOTTOM, '.save-anchor .card-actions'].join(','));
    watched().forEach((el) => ro.observe(el));
    // Controls that appear later (Pearl of the Day, the voice buttons) are picked up as they mount.
    const mo = new MutationObserver(() => {
      watched().forEach((el) => ro.observe(el));
      schedule();
    });
    mo.observe(app, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      probe.remove();
      cardZone.ready = false;
    };
  }, [enabled]);
}
