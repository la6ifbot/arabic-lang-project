import type { OpsCheck, WeeklyStats } from '../store.js';
import { C, esc, FONT_AR, FONT_EN, FONT_UI, formatDate, shell, type Rendered } from './templates.js';

/**
 * The owner's weekly digest (Mondays, 08:00 Amsterdam). Aggregate counts only: no addresses, names or
 * ids ever appear here, so it is safe to forward.
 */

const HOUR = 3_600_000;
/** A nightly backup older than this, or a monthly restore test older than this, is flagged. */
export const BACKUP_STALE_MS = 36 * HOUR;
export const RESTORE_STALE_MS = 35 * 24 * HOUR;

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(
    new Date(iso),
  );

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/** One plain-language line for a background job, and whether it needs a look. */
export function jobLine(check: OpsCheck | undefined, staleMs: number, now: Date): { text: string; warn: boolean } {
  if (!check) return { text: 'not reported yet', warn: false };
  const okAt = check.last_ok_at ? new Date(check.last_ok_at).getTime() : null;
  if (!check.last_ok) {
    return { text: `last run failed (${when(check.last_run_at)})${okAt ? `; last success ${when(check.last_ok_at!)}` : ''}`, warn: true };
  }
  const stale = okAt === null || now.getTime() - okAt > staleMs;
  return { text: `${stale ? 'last success ' : 'succeeded '}${when(check.last_ok_at!)}${stale ? ', too long ago' : ''}`, warn: stale };
}

interface Section {
  title: string;
  rows: [label: string, value: string, warn?: boolean][];
}

export function digestSections(s: WeeklyStats, now: Date): Section[] {
  const backup = jobLine(s.ops.backup, BACKUP_STALE_MS, now);
  const restore = jobLine(s.ops.restore_test, RESTORE_STALE_MS, now);
  const errorSources = Object.entries(s.errors.by_source)
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
  return [
    {
      title: 'Pearl of the Day email',
      rows: [
        ['Subscribers', `${s.subscribers.total.toLocaleString('en-GB')} (${s.subscribers.new} new, ${s.subscribers.unsubscribed} unsubscribed)`],
        ['Waiting to confirm', String(s.subscribers.pending)],
        ['Emails sent', `${s.emails.sent.toLocaleString('en-GB')}${s.emails.failed ? `, ${s.emails.failed} failed` : ''}`, s.emails.failed > 0],
        ['Bounces · complaints', `${s.emails.bounces} · ${s.emails.complaints}`, s.emails.complaints > 0],
        ['Mornings', `${plural(s.emails.days_complete, 'complete day')}${s.emails.days_with_problems ? `, ${plural(s.emails.days_with_problems, 'day')} with a problem` : ''}`, s.emails.days_with_problems > 0],
      ],
    },
    {
      title: 'The sea',
      rows: [
        ['Accounts', `${s.accounts.total.toLocaleString('en-GB')} (${s.accounts.new} new)`],
        ['Reviews', `${plural(s.reviews.words, 'word')} reviewed by ${plural(s.reviews.people, 'person', 'people')}`],
        ['The Deep', s.deep ? plural(s.deep.participants, 'diver') : 'not live yet'],
      ],
    },
    {
      title: 'Behind the scenes',
      rows: [
        ['Nightly backup', backup.text, backup.warn],
        ['Restore test', restore.text, restore.warn],
        ['Errors', s.errors.total ? `${s.errors.total} (${errorSources})` : 'none', s.errors.total > 0],
      ],
    },
  ];
}

export function renderDigest(opts: { stats: WeeklyStats; siteUrl: string; now: Date }): Rendered {
  const { stats } = opts;
  const lastDay = new Date(Date.parse(`${stats.to}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const range = `${formatDate(stats.from)} to ${formatDate(lastDay)}`;
  const sections = digestSections(stats, opts.now);
  const warnings = sections.flatMap((s) => s.rows.filter((r) => r[2]).map((r) => r[0]));
  const subject = `Durar this week: ${plural(stats.subscribers.total, 'subscriber')}, ${plural(stats.accounts.total, 'account')}${warnings.length ? ' · needs a look' : ''}`;
  const lead = warnings.length ? `Needs a look: ${warnings.join(', ')}.` : 'All quiet.';

  const text = [
    'Durar · the week in the sea',
    range,
    '',
    lead,
    ...sections.flatMap((s) => ['', s.title.toUpperCase(), ...s.rows.map(([l, v, w]) => `${w ? '! ' : '  '}${l}: ${v}`)]),
    '',
    'Aggregate counts only. What to do when something needs a look: docs/OPERATIONS.md.',
    `${opts.siteUrl}`,
  ].join('\n');

  const rows = (s: Section) =>
    s.rows
      .map(
        ([l, v, w]) => `<tr>
  <td style="padding:7px 0;font-family:${FONT_UI};font-size:14px;color:${C.faint};vertical-align:top;width:42%;">${esc(l)}</td>
  <td style="padding:7px 0;font-family:${FONT_UI};font-size:14px;color:${w ? '#ffd9a8' : C.ink};vertical-align:top;">${w ? '● ' : ''}${esc(v)}</td>
</tr>`,
      )
      .join('\n');

  const body = `
<tr><td align="center" style="padding:0 0 6px;font-family:${FONT_EN};font-size:17px;font-style:italic;letter-spacing:1px;color:${C.soft};">
  <span lang="ar" dir="rtl" style="font-family:${FONT_AR};font-style:normal;font-size:21px;color:${C.ink};">دُرَر</span>
  &nbsp;·&nbsp; the week in the sea
</td></tr>
<tr><td align="center" style="padding:0 0 22px;font-family:${FONT_UI};font-size:13px;color:${C.faint};">${esc(range)}</td></tr>
<tr><td class="px" style="padding:22px 36px;background:${C.panel};border-radius:18px;" bgcolor="${C.panel}">
  <p style="margin:0 0 14px;font-family:${FONT_EN};font-size:20px;color:${C.ink};">${esc(lead)}</p>
  ${sections
    .map(
      (s) => `<p style="margin:18px 0 4px;font-family:${FONT_UI};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${C.soft};">${esc(s.title)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows(s)}
  </table>`,
    )
    .join('\n')}
</td></tr>
<tr><td class="px" align="center" style="padding:24px 40px 0;font-family:${FONT_UI};font-size:12px;line-height:1.6;color:${C.faint};">
  Aggregate counts only, for the owner of ${esc(opts.siteUrl.replace(/^https?:\/\//, ''))}. What to do when something needs a look: docs/OPERATIONS.md.
</td></tr>`;

  return { subject, text, html: shell({ lang: 'en', title: subject, preheader: lead, body }) };
}
