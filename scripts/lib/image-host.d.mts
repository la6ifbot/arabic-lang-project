export interface PutInput {
  Key: string;
  Body: unknown;
  ContentType?: string;
  CacheControl?: string;
  IfNoneMatch?: string;
}
export interface UploadClient {
  send(input: PutInput): Promise<unknown>;
}
export const IMMUTABLE: string;
export function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]>;
export function headOnHost(keys: string[]): Promise<{ missing: string[]; noCors: string[] }>;
export function checkOnHost(keys: string[], opts?: { wait?: number }): Promise<{ missing: string[]; noCors: string[] }>;
export function s3(): Promise<UploadClient>;
export function putOnce(client: UploadClient, Key: string, Body: unknown, ContentType: string): Promise<'uploaded' | 'exists'>;
