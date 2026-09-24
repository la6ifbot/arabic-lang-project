import { ListSuppressedDestinationsCommand, SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { buildMime } from './mime.js';
import type { EmailSender, Suppressed } from './types.js';

/**
 * Amazon SES (v2 API). Sends raw MIME so we control every header (List-Unsubscribe, one-click).
 * No configuration set is used, so SES open/click tracking is never applied.
 */
export function sesSender(opts: { region: string; accessKeyId: string; secretAccessKey: string }): EmailSender {
  const client = new SESv2Client({
    region: opts.region,
    credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
  });
  return {
    name: 'ses',
    async send(message) {
      const out = await client.send(new SendEmailCommand({ Content: { Raw: { Data: Buffer.from(buildMime(message), 'utf8') } } }));
      return { messageId: out.MessageId ?? '' };
    },
    async listSuppressed(since) {
      const found: Suppressed[] = [];
      let NextToken: string | undefined;
      do {
        const page = await client.send(new ListSuppressedDestinationsCommand({ StartDate: since, NextToken, PageSize: 100 }));
        for (const d of page.SuppressedDestinationSummaries ?? []) {
          if (d.EmailAddress) found.push({ email: d.EmailAddress, reason: d.Reason === 'COMPLAINT' ? 'complaint' : 'bounce' });
        }
        NextToken = page.NextToken;
      } while (NextToken);
      return found;
    },
  };
}
