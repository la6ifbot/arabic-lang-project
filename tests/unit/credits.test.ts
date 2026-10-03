import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import credits from '../../src/data/credits.json';
import pkg from '../../package.json';
import { LICENSES, MUSIC_LICENSES } from '../../shared/credits';

const ROOT = join(__dirname, '../..');
type Music = { file: string; title: string; artist: string; license: string; sourceUrl?: string; licenseName?: string };
const MUSIC = credits.music as Music[];

describe('credits.json', () => {
  test('every font we ship is credited, with the copyright line from its licence', () => {
    const fonts = Object.keys(pkg.dependencies).filter((d) => d.startsWith('@fontsource/'));
    expect(credits.fonts.map((f) => f.package).sort()).toEqual(fonts.sort());
    for (const f of credits.fonts) {
      const license = readFileSync(join(ROOT, 'node_modules', f.package, 'LICENSE'), 'utf8').trimStart();
      expect(license.startsWith(f.copyright), f.package).toBe(true);
      expect(license, f.package).toContain('SIL Open Font License');
    }
  });

  test('every audio file has a music entry with a licence Durar can use', () => {
    const dir = join(ROOT, 'public/audio');
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith('.')) : [];
    expect(MUSIC.map((m) => m.file).sort()).toEqual(files.map((f) => `audio/${f}`).sort());
    for (const m of MUSIC) {
      expect(m.title && m.artist, m.file).toBeTruthy();
      expect(MUSIC_LICENSES, m.file).toContain(m.license);
      if (m.license === 'CC-BY-4.0') expect(m.sourceUrl, `${m.file}: CC BY needs sourceUrl`).toMatch(/^https:\/\//);
      if (m.license === 'licensed') expect(m.licenseName, `${m.file}: licensed needs licenseName`).toBeTruthy();
    }
  });

  test('every licence a credit can name has a deed link', () => {
    for (const [id, l] of Object.entries(LICENSES)) if (id !== 'own-work') expect(l.url, id).toMatch(/^https:\/\//);
  });
});
