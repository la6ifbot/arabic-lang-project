import { randomBytes } from 'node:crypto';
import type { EmailMessage } from './types.js';

/** RFC 2047 encoding so Arabic subject lines survive every mail server. */
const encodeHeader = (value: string) =>
  /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

/** Encodes the display-name part of `Name <addr>` if needed. */
function encodeAddress(addr: string) {
  const m = addr.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? `${encodeHeader(m[1].replace(/^"|"$/g, ''))} <${m[2]}>` : addr;
}

const base64Lines = (s: string) =>
  Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/.{1,76}/g, (line) => `${line}\r\n`);

/** Builds a multipart/alternative (plain text + HTML) message, UTF-8 throughout. */
export function buildMime(msg: EmailMessage, date = new Date()): string {
  const boundary = `durar-${randomBytes(12).toString('hex')}`;
  const headers: Record<string, string> = {
    From: encodeAddress(msg.from),
    To: msg.to,
    ...(msg.replyTo ? { 'Reply-To': encodeAddress(msg.replyTo) } : {}),
    Subject: encodeHeader(msg.subject),
    Date: date.toUTCString().replace('GMT', '+0000'),
    'MIME-Version': '1.0',
    ...msg.headers,
    'Content-Type': `multipart/alternative; boundary="${boundary}"`,
  };
  return [
    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(msg.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(msg.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
