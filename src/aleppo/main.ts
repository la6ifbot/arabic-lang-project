import '@fontsource/aref-ruqaa/arabic-700.css';
import '@fontsource/noto-naskh-arabic/arabic-600.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/cormorant-garamond/latin-ext-500-italic.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-500.css';
import './aleppo.css';
import { PLACES, PLACE_BY_ID, TIMES, type PlaceId } from './places';
import type { TimeId } from './sky';
import type { Viewer } from './viewer';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const app = byId('citadel');
const stage = byId('stage');
const info = byId('info');
const hint = byId('hint');
const orbitToggle = byId<HTMLButtonElement>('orbit');
const labelsToggle = byId<HTMLButtonElement>('labels-toggle');

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
const quality = coarse || Math.min(innerWidth, innerHeight) < 600 || (navigator.hardwareConcurrency ?? 4) <= 4 ? 'low' : 'high';

let viewer: Viewer | null = null;
let time: TimeId = 'shafaq';
let current: PlaceId | null = null;
/** A link to a place (/aleppo#bridge) opens on it, so the camera doesn't start orbiting. */
const linked = location.hash.slice(1) as PlaceId;
const startOrbit = !reducedMotion && !PLACE_BY_ID.has(linked);

if (import.meta.env.VITE_EMBEDDED) byId('home').hidden = true;
hint.textContent = coarse ? 'Drag to look around · pinch to zoom' : 'Drag to look around · scroll to zoom · arrow keys work too';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
};
const arabic = (text: string, className: string) => {
  const s = el('span', { className, textContent: text });
  s.lang = 'ar';
  s.dir = 'rtl';
  return s;
};

// ---------- Places ----------
const placeButtons = new Map<PlaceId, HTMLButtonElement>();
for (const p of PLACES) {
  const b = el('button', { type: 'button', className: 'c-place' }, arabic(p.ar, 'c-place-ar'), el('span', { className: 'c-place-en', textContent: p.en }));
  b.dataset.place = p.id;
  b.addEventListener('click', () => select(p.id));
  placeButtons.set(p.id, b);
  byId('places').append(el('li', {}, b));
}

function select(id: PlaceId) {
  const p = PLACE_BY_ID.get(id)!;
  current = id;
  for (const [pid, b] of placeButtons) b.setAttribute('aria-current', String(pid === id));
  placeButtons.get(id)!.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  info.hidden = false;
  // Filled a frame after it is shown, so screen readers announce the change.
  requestAnimationFrame(() => {
    const body = byId('info-body');
    body.replaceChildren(
      el('h2', { className: 'c-info-title' }, arabic(p.ar, 'c-info-ar'), el('span', { className: 'c-info-tr', textContent: p.translit }), el('span', { className: 'c-info-en', textContent: p.en })),
      el('p', { className: 'c-info-about', textContent: p.about }),
    );
  });
  app.dataset.place = id;
  dismissHint();
  viewer?.flyTo(id);
  try {
    history.replaceState(history.state, '', id === 'overview' ? location.pathname + location.search : `#${id}`);
  } catch {
    /* sandboxed frames */
  }
}

byId('info-close').addEventListener('click', () => {
  info.hidden = true;
  const back = current && placeButtons.get(current);
  current = null;
  for (const b of placeButtons.values()) b.setAttribute('aria-current', 'false');
  back?.focus();
});

// ---------- Time of day ----------
const timeButtons = new Map<TimeId, HTMLButtonElement>();
for (const t of TIMES) {
  const b = el('button', { type: 'button', className: 'c-time' }, arabic(t.ar, 'c-time-ar'), el('span', { className: 'c-time-en', textContent: t.en }));
  b.dataset.time = t.id;
  b.addEventListener('click', () => setTime(t.id));
  timeButtons.set(t.id, b);
  byId('times').append(b);
}
function setTime(id: TimeId) {
  time = id;
  app.dataset.time = id;
  for (const [tid, b] of timeButtons) b.setAttribute('aria-pressed', String(tid === id));
  viewer?.setTime(id);
}
setTime(time);

// ---------- Toggles ----------
const setPressed = (b: HTMLButtonElement, on: boolean) => b.setAttribute('aria-pressed', String(on));
setPressed(orbitToggle, startOrbit);
setPressed(labelsToggle, true);
orbitToggle.addEventListener('click', () => {
  const on = orbitToggle.getAttribute('aria-pressed') !== 'true';
  setPressed(orbitToggle, on);
  viewer?.setAutoOrbit(on);
});
labelsToggle.addEventListener('click', () => {
  const on = labelsToggle.getAttribute('aria-pressed') !== 'true';
  setPressed(labelsToggle, on);
  viewer?.setLabels(on);
});
if (reducedMotion) orbitToggle.hidden = true;

function dismissHint() {
  hint.dataset.gone = '';
}

// ---------- Without WebGL: the citadel in words ----------
function fallback(message: string) {
  viewer?.dispose();
  viewer = null;
  app.dataset.mode = 'text';
  const list = el('ul', { className: 'c-text-list' });
  for (const p of PLACES)
    list.append(
      el(
        'li',
        {},
        el('h2', {}, arabic(p.ar, 'c-info-ar'), el('span', { className: 'c-info-tr', textContent: p.translit }), el('span', { className: 'c-info-en', textContent: p.en })),
        el('p', { textContent: p.about }),
      ),
    );
  const box = byId('fallback');
  box.replaceChildren(el('p', { className: 'c-text-note', textContent: message }), list);
  box.hidden = false;
  byId('boot').dataset.gone = '';
}

const webgl = typeof window !== 'undefined' && 'WebGL2RenderingContext' in window;
if (!webgl) {
  fallback('Your browser can’t show the 3D model, so here is the citadel in words.');
} else {
  import('./viewer')
    .then(({ createViewer }) => {
      viewer = createViewer({
        stage,
        labelLayer: byId('labels'),
        quality,
        reducedMotion,
        time,
        autoOrbit: startOrbit,
        onPick: select,
        onUserMove() {
          setPressed(orbitToggle, false);
          dismissHint();
        },
        onFirstFrame() {
          app.dataset.ready = '';
          byId('boot').dataset.gone = '';
          if (PLACE_BY_ID.has(linked)) select(linked);
        },
        onContextLost() {
          fallback('The 3D view stopped (the graphics card was reset). Reload the page to bring it back. Meanwhile, here is the citadel in words.');
        },
      });
      document.fonts?.ready.then(() => viewer?.relayout());
    })
    .catch((err: unknown) => {
      console.warn('Citadel: 3D view unavailable, showing the text version.', err);
      fallback('Your browser can’t show the 3D model, so here is the citadel in words.');
    });
}
