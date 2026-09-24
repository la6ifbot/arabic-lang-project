export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
}

export interface Suppressed {
  email: string;
  reason: 'bounce' | 'complaint';
}

/** The one place that knows which email provider we use. Swap the implementation, not the callers. */
export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<{ messageId: string }>;
  /** Addresses the provider refuses to send to (hard bounces, complaints), if supported. */
  listSuppressed?(since: Date): Promise<Suppressed[]>;
}
