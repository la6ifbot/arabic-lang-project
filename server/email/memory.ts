import type { EmailMessage, EmailSender, Suppressed } from './types.js';

/** Collects messages instead of sending them: tests, dry runs, and local development. */
export function memorySender(suppressed: Suppressed[] = []): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    name: 'memory',
    sent,
    async send(message) {
      sent.push(message);
      return { messageId: `memory-${sent.length}` };
    },
    async listSuppressed() {
      return suppressed;
    },
  };
}
