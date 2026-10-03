// Import rules that keep first-paint JS small and the browser modules free of Node and data.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = join(__dirname, '../..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
/** Static imports and re-exports, minus type-only ones (erased at build). `import(…)` is how code reaches lazy chunks. */
const staticImports = (src: string) =>
  [...src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2]);

function resolveFrom(file: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // packages
  const base = resolve(ROOT, dirname(file), spec).replace(/\.js$/, '');
  const hit = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')].find((f) => existsSync(f) && statSync(f).isFile());
  return hit ? relative(ROOT, hit) : null;
}

/** Every module the entry chunk pulls in: static imports followed from src/main.tsx. */
function firstPaintModules() {
  const seen = new Set<string>();
  const todo = ['src/main.tsx'];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (!/\.tsx?$/.test(f)) continue;
    for (const spec of staticImports(read(f))) {
      const r = resolveFrom(f, spec);
      if (r) todo.push(r);
    }
  }
  return seen;
}

describe('module boundaries', () => {
  test.each(['shared/site.ts', 'shared/images.ts', 'shared/credits.ts'])('%s is browser-safe and data-free', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/from ['"]node:/);
    expect(src).not.toMatch(/\.json['"]/);
  });

  test('the first-paint JS reaches the illustrations, the Credits copy and shared/cards only through import()', () => {
    const mods = firstPaintModules();
    expect(mods.size).toBeGreaterThan(20); // the walk really follows imports
    expect(mods.has('src/lib/words.ts')).toBe(true);
    const banned = ['shared/images.ts', 'src/lib/illustrations.ts', 'src/data/illustrations.json', 'src/data/credits.json', 'shared/credits.ts', 'shared/cards.ts', 'src/pages/CreditsPage.tsx'];
    expect(banned.filter((f) => mods.has(f))).toEqual([]);
  });
});
