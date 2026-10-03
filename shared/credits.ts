// Licences and credit lines for /credits, the PR report and captions. Browser-safe, data-free.
import type { Illustration } from './images.js';

export const LICENSES = {
  'public-domain': { label: 'Public domain', url: 'https://creativecommons.org/publicdomain/mark/1.0/' },
  'CC0-1.0': { label: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'CC-BY-4.0': { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'OFL-1.1': { label: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org/' },
  'own-work': { label: 'Made for Durar', url: '' },
} as const;
export type LicenseId = keyof typeof LICENSES;

export const IMAGE_LICENSES = ['public-domain', 'CC0-1.0'] as const;
export const MUSIC_LICENSES = ['own-work', 'public-domain', 'CC0-1.0', 'CC-BY-4.0', 'licensed'] as const;

/** "After Pierre-Joseph Redouté, “Rosa centifolia”, Les Roses (1817–1824). Public domain. Restyled by Durar." */
export function creditLine(e: Illustration): string {
  const plate = e.plate ? `“${e.plate}”, ` : '';
  return `After ${e.artist}, ${plate}${e.work} (${e.date}). ${LICENSES[e.license].label}. ${e.flip ? 'Mirrored and restyled' : 'Restyled'} by Durar.`;
}
