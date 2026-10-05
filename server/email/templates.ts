/**
 * Durar's emails: the daily Pearl and the subscription confirmation.
 *
 * Built for email clients: table layout, inline styles, a solid background colour behind every
 * gradient, live text for everything that matters (so it reads with images off), Arabic marked up
 * with lang/dir. No tracking of any kind: no pixels, no redirects, no query parameters on links.
 */
import { cardAlt, cardUrl } from '../../shared/cards.js';
import topics from '../../src/data/topics.json' with { type: 'json' };

export interface EmailWord {
  slug: string;
  ar: string;
  translit: string;
  meanings: string[];
  examples: { ar: string; en: string; source?: string }[];
  /** Topic ids; the first one names the part of the sea the pearl comes from. */
  topics?: string[];
}

const TOPIC_NAMES = new Map(topics.map((t) => [t.id, t.name]));

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

export type SubjectStyle = 'a' | 'b' | 'c';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const C = {
  deep: '#041621',
  panel: '#0b2a36',
  ink: '#f4efe3',
  soft: '#c8dde2',
  faint: '#8fb0b8',
  button: '#dff0ef',
  buttonInk: '#06232b',
};

export const FONT_EN = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
export const FONT_UI = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const FONT_AR = "'Noto Naskh Arabic', 'Geeza Pro', 'Arabic Typesetting', 'Traditional Arabic', Tahoma, serif";

export const SUBJECTS: Record<SubjectStyle, (w: EmailWord) => string> = {
  a: (w) => `دُرَّةُ اليَوْم · ${w.ar} — ${w.meanings[0]}`,
  b: (w) => `Pearl of the Day: ${w.ar} (${w.translit})`,
  c: (w) => `${w.ar} · ${w.translit} — your pearl for today`,
};

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );
}

export function shell({ lang, title, preheader, body }: { lang: string; title: string; preheader: string; body: string }) {
  return `<!doctype html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
<style>
  body { margin: 0; padding: 0; background: ${C.deep}; }
  a { color: ${C.soft}; }
  @media (max-width: 620px) { .px { padding-left: 20px !important; padding-right: 20px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${C.deep};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.deep};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.deep}" style="background:${C.deep};background-image:linear-gradient(180deg,#0e3a47 0%,${C.deep} 420px);">
<tr><td align="center" style="padding:28px 12px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
${body}
</table>
</td></tr>
</table>
</body>
</html>`;
}

function footer(opts: { siteUrl: string; unsubscribeUrl?: string; contactEmail: string | null; reason: string }) {
  const links = [
    opts.unsubscribeUrl && `<a href="${esc(opts.unsubscribeUrl)}" style="color:${C.soft};text-decoration:underline;">Unsubscribe</a>`,
    `<a href="${esc(opts.siteUrl)}/privacy" style="color:${C.soft};text-decoration:underline;">Privacy</a>`,
    opts.contactEmail && `<a href="mailto:${esc(opts.contactEmail)}" style="color:${C.soft};text-decoration:underline;">${esc(opts.contactEmail)}</a>`,
  ].filter(Boolean);
  return `<tr><td class="px" align="center" style="padding:28px 40px 0;font-family:${FONT_UI};font-size:12px;line-height:1.6;color:${C.faint};">
  <p style="margin:0 0 8px;">${esc(opts.reason)}</p>
  <p style="margin:0;">${links.join(' &nbsp;·&nbsp; ')}</p>
</td></tr>`;
}

function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
  <tr><td align="center" bgcolor="${C.button}" style="border-radius:999px;background:${C.button};">
    <a href="${esc(href)}" style="display:inline-block;padding:14px 30px;font-family:${FONT_UI};font-size:15px;font-weight:600;line-height:1;color:${C.buttonInk};text-decoration:none;border-radius:999px;">${esc(label)}</a>
  </td></tr>
</table>`;
}

/** The daily Pearl of the Day email. */
export function renderDaily(opts: {
  word: EmailWord;
  /** “A pearl to revisit”: a due word from the reader's progress (account holders only). */
  revisit?: EmailWord;
  date: string;
  siteUrl: string;
  unsubscribeUrl: string;
  contactEmail: string | null;
  subjectStyle?: SubjectStyle;
}): Rendered {
  const { word: w, siteUrl } = opts;
  const url = `${siteUrl}/word/${w.slug}`;
  const img = cardUrl('email', w);
  const alt = cardAlt(w);
  const ex = w.examples[0];
  const more = w.meanings.slice(1).join('; ');
  const subject = SUBJECTS[opts.subjectStyle ?? 'b'](w);
  const reason =
    'You’re receiving this because you subscribed to the Pearl of the Day, or have a Durar account, with this address. One email a day, around 7:00 in Amsterdam.';
  const rv = opts.revisit;
  const rvUrl = rv ? `${siteUrl}/word/${rv.slug}` : '';
  // “From Sky & stars”: which part of the sea the pearl comes from, when it belongs to a topic.
  const seaId = w.topics?.find((id) => TOPIC_NAMES.has(id));
  const sea = seaId ? { ...TOPIC_NAMES.get(seaId)!, url: `${siteUrl}/sea/${seaId}` } : null;

  const body = `
<tr><td align="center" style="padding:0 0 18px;font-family:${FONT_EN};font-size:17px;font-style:italic;letter-spacing:1px;color:${C.soft};">
  <span lang="ar" dir="rtl" style="font-family:${FONT_AR};font-style:normal;font-size:21px;color:${C.ink};">دُرَّةُ اليَوْم</span>
  &nbsp;·&nbsp; Pearl of the Day &nbsp;·&nbsp; ${esc(formatDate(opts.date))}
</td></tr>
<tr><td align="center" style="padding:0 0 26px;">
  <a href="${esc(url)}" style="text-decoration:none;color:${C.ink};">
    <img src="${esc(img)}" width="560" alt="${esc(alt)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:18px;background:${C.panel};color:${C.ink};font-family:${FONT_EN};font-size:24px;line-height:1.4;">
  </a>
</td></tr>
<tr><td class="px" align="center" style="padding:0 40px;">
  <p style="margin:0 0 4px;font-family:${FONT_EN};font-size:20px;font-style:italic;letter-spacing:1px;color:${C.soft};">${esc(w.translit)}</p>
  <p style="margin:0;font-family:${FONT_EN};font-size:26px;line-height:1.3;color:${C.ink};">${esc(w.meanings[0])}</p>
  ${more ? `<p style="margin:6px 0 0;font-family:${FONT_EN};font-size:18px;font-style:italic;line-height:1.4;color:${C.soft};">${esc(more)}</p>` : ''}
  ${sea ? `<p style="margin:14px 0 0;font-family:${FONT_EN};font-size:16px;font-style:italic;line-height:1.5;color:${C.faint};">From <a href="${esc(sea.url)}" style="color:${C.soft};text-decoration:underline;">${esc(sea.en)}</a> &nbsp;·&nbsp; <span lang="ar" dir="rtl" style="font-family:${FONT_AR};font-style:normal;font-size:18px;">${esc(sea.ar)}</span></p>` : ''}
</td></tr>
${
  ex
    ? `<tr><td class="px" align="center" style="padding:26px 40px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel}" style="background:${C.panel};border-radius:16px;">
    <tr><td align="center" style="padding:20px 24px;">
      <p lang="ar" dir="rtl" style="margin:0 0 8px;font-family:${FONT_AR};font-size:24px;line-height:1.7;color:${C.ink};direction:rtl;unicode-bidi:embed;">${esc(ex.ar)}</p>
      <p style="margin:0;font-family:${FONT_EN};font-size:18px;font-style:italic;line-height:1.45;color:${C.soft};">${esc(ex.en)}</p>
      ${ex.source ? `<p style="margin:6px 0 0;font-family:${FONT_EN};font-size:14px;color:${C.faint};">— ${esc(ex.source)}</p>` : ''}
    </td></tr>
  </table>
</td></tr>`
    : ''
}
${
  rv
    ? `<tr><td class="px" align="center" style="padding:22px 40px 0;font-family:${FONT_EN};font-size:18px;line-height:1.5;color:${C.soft};">
  <p style="margin:0;">A pearl to revisit: <a href="${esc(rvUrl)}" style="color:${C.ink};text-decoration:underline;"><span lang="ar" dir="rtl" style="font-family:${FONT_AR};font-size:22px;">${esc(rv.ar)}</span> (${esc(rv.translit)})</a> — ${esc(rv.meanings[0])}</p>
</td></tr>
`
    : ''
}<tr><td align="center" style="padding:30px 20px 4px;">${button(url, 'Open in Durar')}</td></tr>
${footer({ siteUrl, unsubscribeUrl: opts.unsubscribeUrl, contactEmail: opts.contactEmail, reason })}`;

  const text = [
    `دُرَّةُ اليَوْم · Pearl of the Day · ${formatDate(opts.date)}`,
    '',
    w.ar,
    w.translit,
    w.meanings[0],
    more,
    sea ? `From ${sea.en} · ${sea.ar}: ${sea.url}` : '',
    '',
    ex ? ex.ar : '',
    ex ? ex.en : '',
    ex?.source ? `— ${ex.source}` : '',
    '',
    rv ? `A pearl to revisit: ${rv.ar} (${rv.translit}) — ${rv.meanings[0]}: ${rvUrl}` : '',
    `Open in Durar: ${url}`,
    '',
    '—',
    reason,
    `Unsubscribe: ${opts.unsubscribeUrl}`,
    `Privacy: ${siteUrl}/privacy`,
    opts.contactEmail ? `Contact: ${opts.contactEmail}` : '',
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n');

  return {
    subject,
    html: shell({ lang: 'en', title: subject, preheader: `${w.translit}: ${w.meanings[0]}. ${ex ? ex.en : ''}`, body }),
    text,
  };
}

/** The double opt-in confirmation email. Short on purpose. */
export function renderConfirmation(opts: {
  confirmUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
  contactEmail: string | null;
}): Rendered {
  const subject = 'Confirm your Pearl of the Day · أَكِّدِ اشْتِرَاكَك';
  const reason = 'Someone (hopefully you) asked to get the Pearl of the Day at this address. If it wasn’t you, ignore this email and you won’t hear from us again.';
  const body = `
<tr><td align="center" style="padding:8px 0 18px;">
  <p lang="ar" dir="rtl" style="margin:0;font-family:${FONT_AR};font-size:44px;line-height:1.3;color:${C.ink};">دُرَر</p>
</td></tr>
<tr><td class="px" align="center" style="padding:0 40px;">
  <p style="margin:0 0 10px;font-family:${FONT_EN};font-size:28px;line-height:1.25;color:${C.ink};">One tap to confirm</p>
  <p style="margin:0;font-family:${FONT_UI};font-size:15px;line-height:1.6;color:${C.soft};">Confirm your address and a new Arabic word will reach you each morning at about 7:00 (Amsterdam time): the word, its meaning, and a sentence to hold it.</p>
</td></tr>
<tr><td align="center" style="padding:28px 20px 4px;">${button(opts.confirmUrl, 'Confirm my subscription')}</td></tr>
<tr><td class="px" align="center" style="padding:14px 40px 0;font-family:${FONT_UI};font-size:12px;line-height:1.6;color:${C.faint};">
  <p style="margin:0;">Or open this link: <a href="${esc(opts.confirmUrl)}" style="color:${C.soft};word-break:break-all;">${esc(opts.confirmUrl)}</a></p>
  <p style="margin:6px 0 0;">The link works for 7 days.</p>
</td></tr>
${footer({ siteUrl: opts.siteUrl, unsubscribeUrl: opts.unsubscribeUrl, contactEmail: opts.contactEmail, reason })}`;

  const text = [
    'دُرَر · Durar',
    '',
    'One tap to confirm.',
    'Confirm your address and a new Arabic word will reach you each morning at about 7:00 (Amsterdam time).',
    '',
    `Confirm: ${opts.confirmUrl}`,
    '(The link works for 7 days.)',
    '',
    '—',
    reason,
    `Privacy: ${opts.siteUrl}/privacy`,
    opts.contactEmail ? `Contact: ${opts.contactEmail}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html: shell({ lang: 'en', title: subject, preheader: 'Confirm to start receiving one Arabic word a day.', body }), text };
}
