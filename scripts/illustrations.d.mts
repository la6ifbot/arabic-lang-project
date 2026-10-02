import type { Illustration } from '../shared/images';
import type { Restyled } from './lib/illustration-pipeline.mjs';
import type { UploadClient } from './lib/image-host.mjs';

/** What Commons said about a source, as archived in sources/<id>.json. */
export interface SourceMeta {
  key: string;
  sha256: string;
  license: string;
  licenseShortName: string;
  artist: string;
  date: string;
  [field: string]: unknown;
}
export function politeFetch(url: string, opts?: { timeout?: number; attempts?: number }): Promise<Response>;
export function commonsInfo(
  sourceUrl: string,
): Promise<{ title: string; info: Record<string, unknown>; license: string; licenseShortName: string; artist: string; date: string }>;
export function licenseProblem(entry: Pick<Illustration, 'license'>, c: { license: string; licenseShortName: string }): string | null;
export function loadSource(entry: Illustration, client?: UploadClient | null): Promise<{ bytes: Buffer; meta: SourceMeta; archived: boolean }>;
export function renderEntry(entry: Illustration, client?: UploadClient | null, out?: string): Promise<{ r: Restyled; meta: SourceMeta; archived: boolean }>;
export function report(rows: { e: Illustration; meta?: SourceMeta | null; error?: string; usedBy: string[]; notes: string[] }[]): string;
export interface Data {
  entries: Illustration[];
  words: { slug: string; image?: string; topics?: string[] }[];
  topics: { id: string; cover?: string }[];
}
export function main(argv: string[], deps?: { client?: UploadClient; data?: Data; out?: string }): Promise<void>;
