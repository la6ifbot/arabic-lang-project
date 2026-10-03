export const ORIGINAL_ADDED: string;
export const TAG_TO_TOPICS: Record<string, string[]>;
export const OVERRIDES: Record<string, { add?: string[]; remove?: string[] }>;
type OldWord = { slug: string; tags?: string[]; added?: string; [key: string]: unknown };
export function topicsFor(word: OldWord, order?: string[]): string[];
export function migrateWord(word: OldWord, order?: string[]): Record<string, unknown> & { topics: string[]; added: string };
export function formatWords(words: unknown[]): string;
