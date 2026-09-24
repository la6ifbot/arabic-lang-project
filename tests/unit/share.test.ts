import { describe, expect, test } from 'vitest';
import words from '../../src/data/words.json';
import { imageDescription, imageFileName, shareMessage, shareText, whatsappUrl, wordUrl } from '../../src/share/text';
import { canonicalOrigin } from '../../shared/site';

const sarab = words.find((w) => w.slug === 'sarab')!;
const strip = (s: string) => s.replace(/[‎⁨⁩]/g, '');

describe('share links', () => {
  test('always the canonical word page on durar.space, with no query parameters', () => {
    expect(wordUrl('sarab')).toBe('https://durar.space/word/sarab');
    expect(wordUrl('qaws-quzah')).toBe('https://durar.space/word/qaws-quzah');
    for (const w of words) expect(new URL(wordUrl(w.slug)).search).toBe('');
  });

  test('the canonical origin comes from SITE_URL or Vercel, else durar.space', () => {
    expect(canonicalOrigin({})).toBe('https://durar.space');
    expect(canonicalOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'durar.space' })).toBe('https://durar.space');
    expect(canonicalOrigin({ SITE_URL: 'https://durar.space/' })).toBe('https://durar.space');
  });
});

describe('share text', () => {
  test('bilingual template', () => {
    expect(strip(shareText(sarab))).toBe('سَرَاب (sarāb) — mirage · a pearl from Durar');
  });

  test('today’s pearl variant', () => {
    expect(strip(shareText(sarab, { today: true }))).toBe('دُرَّةُ اليَوْم · Today’s pearl: سَرَاب (sarāb) — mirage');
  });

  test('keeps mixed Arabic/English in order: left-to-right line, Arabic isolated', () => {
    const t = shareText(sarab);
    expect(t.startsWith('‎')).toBe(true);
    expect(t).toContain('⁨سَرَاب⁩');
  });

  test('message and WhatsApp link: text then the canonical link, correctly encoded, nothing else', () => {
    expect(strip(shareMessage(sarab))).toBe('سَرَاب (sarāb) — mirage · a pearl from Durar\nhttps://durar.space/word/sarab');
    const wa = new URL(whatsappUrl(sarab, { today: true }));
    expect(wa.origin + wa.pathname).toBe('https://wa.me/');
    expect([...wa.searchParams.keys()]).toEqual(['text']);
    expect(wa.searchParams.get('text')).toBe(shareMessage(sarab, { today: true }));
    expect(whatsappUrl(sarab)).not.toMatch(/utm_|%3Futm/i);
  });

  test('file name and image description', () => {
    expect(imageFileName('sarab')).toBe('durar-sarab.png');
    expect(imageDescription(sarab)).toBe('سَرَاب (sarāb): mirage');
  });
});
