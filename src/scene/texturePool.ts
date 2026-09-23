import * as THREE from 'three';
import { CARD_ASPECT, cardTextureHeight, drawCard } from '../lib/cardTexture';
import type { Word } from '../types';

// ---------------------------------------------------------------------------------------------
// Texture pool: cards come and go constantly, so reuse textures instead of redrawing each time.

interface Entry {
  texture: THREE.CanvasTexture;
  refs: number;
  lastUsed: number;
}

const pool = new Map<string, Entry>();
const SPARE = 8;

export function acquireCardTexture(word: Word, anisotropy: number): THREE.CanvasTexture {
  let e = pool.get(word.slug);
  if (!e) {
    const canvas = document.createElement('canvas');
    canvas.height = cardTextureHeight();
    canvas.width = Math.round(canvas.height * CARD_ASPECT);
    drawCard(canvas, word);
    const texture = new THREE.CanvasTexture(canvas);
    // Premultiplied so mip-mapped (blurred) text keeps its brightness; raw colour values, since
    // the card shader writes display colours directly.
    texture.premultiplyAlpha = true;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = anisotropy;
    e = { texture, refs: 0, lastUsed: 0 };
    pool.set(word.slug, e);
  }
  e.refs++;
  e.lastUsed = performance.now();
  return e.texture;
}

export function releaseCardTexture(slug: string) {
  const e = pool.get(slug);
  if (!e) return;
  e.refs = Math.max(0, e.refs - 1);
  e.lastUsed = performance.now();
  const idle = [...pool.entries()].filter(([, v]) => v.refs === 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  while (idle.length > SPARE) {
    const [key, v] = idle.shift()!;
    v.texture.dispose();
    pool.delete(key);
  }
}
