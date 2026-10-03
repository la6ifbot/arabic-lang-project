import type { Illustration } from '../../shared/images';

type Recipe = Partial<Illustration>;
export interface Restyled {
  files: { width: number; buf: Buffer }[];
  side: number;
  upscale: number;
  warnings: string[];
  source: [number, number];
  cropPx: number[];
}
export function cropBox(input: Buffer, entry: Recipe): Promise<{ SW: number; SH: number; left: number; top: number; width: number; height: number }>;
export function restyle(input: Buffer, entry: Recipe, P?: unknown): Promise<Restyled>;
export function contactSheet(input: Buffer, entry: Recipe, result: Restyled, behindText?: number): Promise<Buffer>;
