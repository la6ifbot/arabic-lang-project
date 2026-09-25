import type { Rendered } from './templates.js';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The owner's “the morning email needs a look” message. Plain on purpose: it's for one person. */
export function renderAlert(opts: { date: string; problems: string[]; details: unknown; siteUrl: string }): Rendered {
  const subject = `Durar: the ${opts.date} email needs a look`;
  const lines = [
    `The health check found a problem with today's Pearl of the Day email (${opts.date}):`,
    '',
    ...opts.problems.map((p) => `• ${p}`),
    '',
    'What to do: see “If a morning email doesn’t arrive” in docs/OPERATIONS.md.',
    '',
    'Details:',
    JSON.stringify(opts.details, null, 2),
    '',
    `— ${opts.siteUrl}/api/cron/health`,
  ];
  const text = lines.join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;background:#fff;">
<pre style="white-space:pre-wrap;font-family:inherit;">${esc(text)}</pre>
</body></html>`;
  return { subject, html, text };
}
