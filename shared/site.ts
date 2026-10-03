/**
 * The canonical public origin. Shared links, the story image and prerendered tags always point here,
 * whichever deployment (preview, local) the visitor happens to be on.
 */
export const DEFAULT_ORIGIN = 'https://durar.space';

/** The image host (S3 + CloudFront): card images and illustrations. Browser-safe. */
export const IMAGE_ORIGIN = 'https://img.durar.space';

export function canonicalOrigin(env: Record<string, string | undefined>): string {
  const raw = env.SITE_URL || env.VERCEL_PROJECT_PRODUCTION_URL || DEFAULT_ORIGIN;
  return (/^https?:\/\//.test(raw) ? raw : `https://${raw}`).replace(/\/$/, '');
}
