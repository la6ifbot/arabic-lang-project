import * as THREE from 'three';
import { PLACE_BY_ID, type PlaceId } from './places';
import type { Anchor } from './spots';

interface Item {
  id: PlaceId;
  pos: THREE.Vector3;
  el: HTMLButtonElement;
  pill: HTMLElement;
  w: number;
  h: number;
  occluded: boolean;
  shown: boolean;
}

const STEM = 26; // px from the anchor dot to the bottom of the pill

/**
 * Arabic + English labels pinned to places in the scene. They hide behind the mound, leave the
 * screen with their anchor, and give way to one another when they would overlap. They are a
 * pointer convenience: the same places are in the keyboard-accessible Places list.
 */
export class Labels {
  private items: Item[] = [];
  private ray = new THREE.Raycaster();
  private v = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private lastOcclusion = -1e9;
  private on = true;

  constructor(
    private layer: HTMLElement,
    anchors: Anchor[],
    private colliders: THREE.Object3D[],
    onPick: (id: PlaceId) => void,
  ) {
    for (const a of anchors) {
      const place = PLACE_BY_ID.get(a.id)!;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'c-label';
      el.tabIndex = -1;
      el.dataset.place = a.id;
      el.toggleAttribute('data-hidden', true);
      const pill = document.createElement('span');
      pill.className = 'c-label-pill';
      const ar = document.createElement('span');
      ar.className = 'c-label-ar';
      ar.lang = 'ar';
      ar.dir = 'rtl';
      ar.textContent = place.ar;
      const en = document.createElement('span');
      en.className = 'c-label-en';
      en.textContent = place.en.replace(/^The /, '');
      pill.append(ar, en);
      el.append(pill);
      el.addEventListener('click', () => onPick(a.id));
      layer.append(el);
      this.items.push({ id: a.id, pos: a.pos, el, pill, w: 0, h: 0, occluded: false, shown: false });
    }
    this.measure();
  }

  /** Pill sizes, for the overlap test. Call again after fonts load or the layout changes. */
  measure() {
    for (const it of this.items) {
      it.w = it.pill.offsetWidth;
      it.h = it.pill.offsetHeight;
    }
  }

  set enabled(on: boolean) {
    this.on = on;
    this.layer.hidden = !on;
  }

  update(camera: THREE.PerspectiveCamera, width: number, height: number, now: number, settle = false) {
    if (!this.on) return;
    const checkOcclusion = settle || now - this.lastOcclusion > 160;
    if (checkOcclusion) this.lastOcclusion = now;
    const placed: [number, number, number, number][] = [];
    for (const it of this.items) {
      this.v.copy(it.pos).project(camera);
      const behind = this.v.z > 1;
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      if (checkOcclusion && !behind) {
        const dist = this.dir.copy(it.pos).sub(camera.position).length();
        this.dir.divideScalar(dist);
        this.ray.set(camera.position, this.dir);
        this.ray.far = dist - 4;
        it.occluded = this.ray.intersectObjects(this.colliders, false).length > 0;
      }
      const rect: [number, number, number, number] = [x - it.w / 2 - 4, y - STEM - it.h - 4, x + it.w / 2 + 4, y + 4];
      const offscreen = rect[2] < 0 || rect[0] > width || rect[3] < 0 || rect[1] > height;
      const clash = placed.some((r) => rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1]);
      const show = !behind && !offscreen && !it.occluded && !clash;
      if (show) {
        placed.push(rect);
        it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
      if (show !== it.shown) {
        it.shown = show;
        it.el.toggleAttribute('data-hidden', !show);
      }
    }
  }

  dispose() {
    for (const it of this.items) it.el.remove();
    this.items = [];
  }
}
