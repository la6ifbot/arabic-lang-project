export const IMAGE_LICENSES: string[];
export const STYLES: string[];
export const COMMONS_FILE: RegExp;
export interface Report {
  errors: string[];
  warnings: string[];
}
export function validateIllustrations(
  entries: unknown,
  words?: { slug: string; image?: string; topics?: string[] }[],
  topics?: { id: string; cover?: string }[],
  opts?: { year?: number },
): Report;
