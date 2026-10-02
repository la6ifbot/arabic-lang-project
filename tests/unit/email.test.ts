import { describe, expect, test } from 'vitest';
import words from '../../src/data/words.json';
import { buildMime } from '../../server/email/mime';
import { renderConfirmation, renderDaily, SUBJECTS, type EmailWord } from '../../server/email/templates';
import { IMAGE_ORIGIN } from '../../shared/cards';

const WORDS = words as EmailWord[];
const bahr = WORDS.find((w) => w.slug === 'bahr')!;
const SITE = 'https://durar.example';
const UNSUB = `${SITE}/unsubscribe?token=abc.def`;

const daily = renderDaily({ word: bahr, date: '2026-09-24', siteUrl: SITE, unsubscribeUrl: UNSUB, contactEmail: 'hello@durar.example' });
const sarab = WORDS.find((w) => w.slug === 'sarab')!;
const withRevisit = renderDaily({ word: bahr, revisit: sarab, date: '2026-09-24', siteUrl: SITE, unsubscribeUrl: UNSUB, contactEmail: 'hello@durar.example' });
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
    expect(daily.html).toContain(`src="${IMAGE_ORIGIN}/cards/email/bahr-a60d7be54c8c7b0e.png"`);
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

  test('“A pearl to revisit”: one line under the main card, live RTL text, linked, and in the plain text', () => {
    expect(withRevisit.html).toMatchSnapshot('html with revisit');
    expect(withRevisit.text).toMatchSnapshot('text with revisit');
    expect(withRevisit.html).toContain(
      `A pearl to revisit: <a href="${SITE}/word/sarab"`,
    );
    expect(withRevisit.html).toMatch(/<span lang="ar" dir="rtl"[^>]*>سَرَاب<\/span> \(sarāb\)<\/a> — mirage/);
    expect(withRevisit.text).toContain(`A pearl to revisit: سَرَاب (sarāb) — mirage: ${SITE}/word/sarab`);
    expect(withRevisit.subject).toBe(daily.subject);
    // Without a revisit word the email is exactly as before.
    expect(daily.html).not.toContain('A pearl to revisit');
    expect(daily.text).not.toContain('A pearl to revisit');
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
    ['daily with a pearl to revisit', withRevisit],
    ['confirmation', confirmation],
  ] as const) {
    test(`${name}: no tracking pixels, redirects or campaign parameters`, () => {
      const images = [...email.html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
      expect(images.length).toBeLessThanOrEqual(1);
      for (const img of images) {
        expect(img).not.toMatch(/width="1"|height="1"|display:\s*none/);
        // A plain, content-hashed file on the image host: nothing in the URL says who opened it.
        expect(img).toMatch(new RegExp(`src="${IMAGE_ORIGIN}/cards/email/[a-z0-9-]+-[0-9a-f]{16}\\.png"`));
      }
      expect(email.html).not.toMatch(/background(-image)?:\s*url\(/); // no hidden image loads
      for (const u of urls(email.html, email.text)) {
        expect(u.startsWith(SITE) || u.startsWith(`${IMAGE_ORIGIN}/cards/`) || u.startsWith('mailto:'), u).toBe(true);
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

describe('the topic line', () => {
  test('names the pearl’s first topic, linked to its topic page, in both parts', () => {
    expect(daily.html).toContain('From <a href="https://durar.example/sea/water"');
    expect(daily.html).toContain('<span lang="ar" dir="rtl"');
    expect(daily.text).toContain('From Sea & water · البحر والماء: https://durar.example/sea/water');
  });

  test('is left out for a word in no topic', () => {
    const plain = renderDaily({ word: { ...bahr, topics: [] }, date: '2026-09-24', siteUrl: SITE, unsubscribeUrl: UNSUB, contactEmail: null });
    expect(plain.html).not.toContain('/sea/');
    expect(plain.text).not.toContain('/sea/');
  });
});
