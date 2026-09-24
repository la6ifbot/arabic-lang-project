import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** A random, URL-safe token. Only its hash is stored. */
export const randomToken = () => randomBytes(32).toString('base64url');

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const mac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('base64url');

/**
 * Unsubscribe links are signed rather than stored: `<subscriber id>.<HMAC>`. The same link works
 * in every email, and can't be forged or guessed for someone else.
 */
export function unsubscribeToken(subscriberId: string, secret: string): string {
  if (!secret) throw new Error('EMAIL_TOKEN_SECRET is not set');
  return `${subscriberId}.${mac(secret, `unsubscribe:${subscriberId}`)}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  if (!secret) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const expected = Buffer.from(mac(secret, `unsubscribe:${id}`));
  const given = Buffer.from(token.slice(dot + 1));
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

/** IP addresses are only ever stored as a keyed hash, for rate limiting. */
export const ipHash = (ip: string, secret: string) => mac(secret, `ip:${ip}`).slice(0, 32);
