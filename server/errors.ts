/**
 * The error log keeps no personal data: addresses, ids, IP addresses and tokens are replaced before
 * a message is written, and messages are cut short. What's left says which part failed and how.
 */
export function scrub(raw: string): string {
  return raw
    .replace(/[^\s@<>()[\],;:"']+@[^\s@<>()[\],;:"']+/g, '[email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[ip]')
    .replace(/\b[0-9a-f]{0,4}(:[0-9a-f]{0,4}){4,7}\b/gi, '[ip]')
    .replace(/\b(token|key|secret|bearer|authorization)([=:\s"]+)[^\s&"',]+/gi, '$1$2[hidden]')
    .replace(/\b[A-Za-z0-9_-]{32,}(\.[A-Za-z0-9_-]+)*\b/g, '[hidden]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export interface LoggedError {
  code: string | null;
  message: string;
}

export function describeError(e: unknown): LoggedError {
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    return { code: (typeof code === 'string' && code) || e.name || null, message: scrub(e.message) };
  }
  return { code: null, message: scrub(String(e)) };
}
