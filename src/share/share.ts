import { TODAY } from '../lib/words';
import type { Word } from '../types';
import { storyFile } from './image';
import { imageDescription, shareText, wordUrl } from './text';

/**
 * Sharing, loaded on first use. Every image that leaves the site comes from `storyFile`, so it is
 * always signed. Nothing here counts, tags or reports shares.
 */

const pending = new Map<string, Promise<File>>();
const ready = new Map<string, File>();

/** Renders (once) and keeps the story image for a word, so a later tap can share it at once. */
export function prepare(word: Word): Promise<File> {
  let p = pending.get(word.slug);
  if (!p) {
    p = storyFile(word);
    p.then(
      (f) => ready.set(word.slug, f),
      () => pending.delete(word.slug),
    );
    pending.set(word.slug, p);
    // Keep only the most recent few; each is ~1.6 MB.
    if (pending.size > 3) {
      const oldest = pending.keys().next().value!;
      pending.delete(oldest);
      ready.delete(oldest);
    }
  }
  return p;
}

export const isToday = (word: Word) => word.slug === TODAY.slug;

let filesBroken = false;
function canShareFiles() {
  if (filesBroken || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(8)], 'durar.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

export type Outcome = 'shared' | 'cancelled' | 'retry' | 'menu';

/**
 * Phones: the system share sheet with the signed image, the text and the link.
 *
 * iOS only opens the sheet straight from a tap, so when the image is already prepared (it is
 * rendered while the phone is idle) `navigator.share` runs before anything is awaited. If the
 * image had to be drawn first and the browser then refuses, the image is ready and a second tap
 * shares it immediately (`retry`).
 */
export async function shareOnPhone(word: Word): Promise<Outcome> {
  if (typeof navigator.share !== 'function') return 'menu';
  const base: ShareData = { title: imageDescription(word), text: shareText(word, { today: isToday(word) }), url: wordUrl(word.slug) };
  let data = base;
  if (canShareFiles()) {
    // No await when the image is ready: the share sheet opens within the tap.
    const file = ready.get(word.slug) ?? (await prepare(word).catch(() => null));
    if (file) data = { ...base, files: [file] };
  }
  for (;;) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      const name = (e as DOMException | null)?.name;
      if (name === 'AbortError') return 'cancelled';
      if (name === 'NotAllowedError') return 'retry';
      // The browser can't share this file after all: remember, and share the link and text.
      if (data.files) {
        filesBroken = true;
        data = base;
        continue;
      }
      return 'menu';
    }
  }
}

/** Copies the canonical link. */
export async function copyLink(word: Word): Promise<boolean> {
  const url = wordUrl(word.slug);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Older browsers / insecure contexts: the classic hidden-textarea copy.
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Saves durar-<slug>.png, the same signed image the phones share. */
export async function download(word: Word): Promise<void> {
  const file = await prepare(word);
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
