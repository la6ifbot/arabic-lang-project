import type { Speech } from '../shared/audio';
export function speechJobs(words: unknown[]): (Speech & { slug: string; what: string })[];
export function cost(chars: number, engine?: 'neural' | 'standard'): number;
export function spotCheck(words: unknown[]): { slug: string; ar: string; translit: string; why: string[] }[];
