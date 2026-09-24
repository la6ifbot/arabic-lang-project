import { describe, expect, test } from 'vitest';
import words from '../../src/data/words.json';
import { buildMime } from '../../server/email/mime';
import { renderConfirmation, renderDaily, SUBJECTS, type EmailWord } from '../../server/email/templates';

const WORDS = words as EmailWord[];
const bahr = WORDS.find((w) => w.slug === 'bahr')!;
const SITE = 'https://durar.example';
const UNSUB = `${SITE}/unsubscribe?token=abc.def`;

const daily = renderDaily({ word: bahr, date: '2026-09-24', siteUrl: SITE, unsubscribeUrl: UNSUB, contactEmail: 'hello@durar.example' });
const confirmation = renderConfirmation({ confirmUrl: `${SITE}/subscribe/confirm?token=xyz`, siteUrl: SITE, unsubscribeUrl: UNSUB, contactEmail: null });

/** Every URL an email contains, from href/src attributes and the plain-text part. */
const urls = (html: string, text = '') => [
  ...[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')),
  ...[...text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]),
];

describe('daily email', () => {
  test('matches the snapshot', () => {
    expect(daily.subject).toMatchSnapshot('subject');
    expect(daily.html).toMatchSnapshot('html');
    expect(daily.text).toMatchSnapshot('text');
  });

  test('has the card image with real alt text, then live text for everything important', () => {
    expect(daily.html).toContain(`src="${SITE}/cards/email/bahr.png"`);
    expect(daily.html).toContain('alt="بَحْر (baḥr): sea"');
    for (const s of ['baḥr', 'sea', 'أنا البحر في أحشائه الدر كامن', 'I am the sea; in its depths the pearls lie hidden.']) {
      expect(daily.html).toContain(s);
      expect(daily.text).toContain(s);
    }
  });

  test('marks Arabic as right-to-left', () => {
    expect(daily.html).toMatch(/<p lang="ar" dir="rtl"[^>]*>أنا البحر/);
    expect(daily.html).toMatch(/<span lang="ar" dir="rtl"[^>]*>دُرَّةُ اليَوْم/);
  });

  test('links to the word, unsubscribe, privacy and contact, with nothing else', () => {
    expect(daily.html).toContain(`href="${SITE}/word/bahr"`);
    expect(daily.html).toContain('>Open in Durar<');
    expect(daily.html).toContain(`href="${UNSUB}"`);
    expect(daily.html).toContain(`href="${SITE}/privacy"`);
    expect(daily.html).toContain('href="mailto:hello@durar.example"');
    expect(daily.text).toContain(`Unsubscribe: ${UNSUB}`);
  });

  test('three bilingual subject lines to choose from', () => {
    expect(Object.values(SUBJECTS).map((s) => s(bahr))).toEqual([
      'دُرَّةُ اليَوْم · بَحْر — sea',
      'Pearl of the Day: بَحْر (baḥr)',
      'بَحْر · baḥr — your pearl for today',
    ]);
  });
});

describe('no tracking, in any email', () => {
  for (const [name, email] of [
    ['daily', daily],
    ['confirmation', confirmation],
  ] as const) {
    test(`${name}: no tracking pixels, redirects or campaign parameters`, () => {
      const images = [...email.html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
      expect(images.length).toBeLessThanOrEqual(1);
      for (const img of images) {
        expect(img).not.toMatch(/width="1"|height="1"|display:\s*none/);
        expect(img).toMatch(new RegExp(`src="${SITE}/cards/email/[a-z0-9-]+\\.png"`));
      }
      expect(email.html).not.toMatch(/background(-image)?:\s*url\(/); // no hidden image loads
      for (const u of urls(email.html, email.text)) {
        expect(u.startsWith(SITE) || u.startsWith('mailto:'), u).toBe(true);
        expect(u, u).not.toMatch(/utm_|[?&](ref|src|cid|mc_|trk)=/i);
        const q = new URL(u.startsWith('mailto:') ? 'https://x' : u).searchParams;
        // The only query parameter any link may carry is a subscription token.
        expect([...q.keys()].every((k) => k === 'token'), u).toBe(true);
      }
    });
  }
});

describe('confirmation email', () => {
  test('matches the snapshot, and carries the confirm link as a button and as plain text', () => {
    expect(confirmation.subject).toMatchSnapshot('subject');
    expect(confirmation.html).toMatchSnapshot('html');
    expect(confirmation.html).toContain(`href="${SITE}/subscribe/confirm?token=xyz"`);
    expect(confirmation.text).toContain(`${SITE}/subscribe/confirm?token=xyz`);
  });
});

describe('MIME', () => {
  test('multipart/alternative with UTF-8 subject and one-click unsubscribe headers', () => {
    const raw = buildMime(
      {
        to: 'reader@example.com',
        from: 'Durar <pearls@durar.example>',
        ...daily,
        headers: { 'List-Unsubscribe': '<https://durar.example/api/unsubscribe?token=t>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      },
      new Date('2026-09-24T05:10:00Z'),
    );
    expect(raw).toMatch(/^From: Durar <pearls@durar\.example>\r\n/);
    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from(daily.subject).toString('base64')}?=`);
    expect(raw).toContain('List-Unsubscribe: <https://durar.example/api/unsubscribe?token=t>');
    expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    expect(raw).toMatch(/Content-Type: multipart\/alternative; boundary="durar-[0-9a-f]+"/);
    expect(raw).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(raw).toContain('Content-Type: text/html; charset=UTF-8');
    expect(raw.split('\r\n').every((l) => l.length <= 998)).toBe(true);
  });
});
