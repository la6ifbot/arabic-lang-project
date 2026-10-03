// Browser glue for illustrations. Import ONLY from lazy chunks (scene/texturePool, share/*, pages/CreditsPage,
// or via import() from the text view): it carries src/data/illustrations.json.
import registry from '../data/illustrations.json';
import { illustrationSrcSet, illustrationUrl, type Illustration } from '../../shared/images';

export const ILLUSTRATIONS = registry as Illustration[];
const BY_ID = new Map(ILLUSTRATIONS.map((e) => [e.id, e]));

/** The registry entry for an id (word.image, topic.cover), or null. Never throws. */
export const illustration = (id: string | undefined | null): Illustration | null => (id ? (BY_ID.get(id) ?? null) : null);

/** URL of the smallest rendition ≥ `px` device pixels, or null for an unknown id. */
export function illustrationSrc(id: string | undefined | null, px = 960): string | null {
  const e = illustration(id);
  return e ? illustrationUrl(e, px) : null;
}

export function illustrationSrcSetFor(id: string | undefined | null): string | undefined {
  const e = illustration(id);
  return e ? illustrationSrcSet(e) : undefined;
}

const cache = new Map<string, Promise<HTMLImageElement | null>>();

/**
 * A decoded image that can be drawn into a canvas that is later read back (WebGL texImage2D, toBlob)
 * without tainting it. Resolves null on an unknown id, 404, missing CORS header, timeout or offline.
 * Never rejects. Keeps the 8 most recent; failures are forgotten so a later call retries.
 */
export function loadIllustration(id: string | undefined | null, px: number, timeoutMs = 4000): Promise<HTMLImageElement | null> {
  const url = illustrationSrc(id, px);
  if (!url) return Promise.resolve(null);
  const hit = cache.get(url);
  if (hit) {
    cache.delete(url);
    cache.set(url, hit);
    return hit;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous'; // before src: CORS mode, so a response without ACAO fails instead of tainting
  img.decoding = 'async';
  img.src = url;
  let timer = 0;
  const p = Promise.race([
    img.decode().then(() => img),
    new Promise<null>((r) => {
      timer = window.setTimeout(() => r(null), timeoutMs);
    }),
  ])
    .catch(() => null)
    .then((v) => {
      clearTimeout(timer);
      if (!v) {
        cache.delete(url);
        img.src = '';
      }
      return v;
    });
  cache.set(url, p);
  while (cache.size > 8) cache.delete(cache.keys().next().value!);
  return p;
}
