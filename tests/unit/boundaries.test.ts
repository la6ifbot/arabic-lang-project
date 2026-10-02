// Import rules that keep first-paint JS small and the browser modules free of Node and data.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = join(__dirname, '../..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [relative(ROOT, join(ROOT, dir, d.name))] : [],
  );
/** Static imports only: `import(…)` inside an effect is how the main chunk reaches lazy modules. */
const staticImports = (src: string) => [...src.matchAll(/^\s*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

describe('module boundaries', () => {
  test.each(['shared/site.ts', 'shared/images.ts', 'shared/credits.ts'])('%s is browser-safe and data-free', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/from ['"]node:/);
    expect(src).not.toMatch(/\.json['"]/);
  });

  test('the browser never imports shared/cards (it uses node:crypto)', () => {
    for (const f of walk('src')) expect(staticImports(read(f)).filter((i) => i.includes('shared/cards')), f).toEqual([]);
  });

  test('first-paint modules reach the illustration registry only through import()', () => {
    const entry = ['src/main.tsx', 'src/App.tsx', 'src/lib/cardTexture.ts', 'src/lib/words.ts', 'src/lib/router.ts', ...walk('src/ui')];
    for (const f of entry)
      expect(staticImports(read(f)).filter((i) => /shared\/images|lib\/illustrations|data\/illustrations/.test(i)), f).toEqual([]);
  });
});
