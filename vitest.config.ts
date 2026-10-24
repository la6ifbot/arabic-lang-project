import { defineConfig } from 'vitest/config';
import { splitWords } from './vite.config';

// Unit + server tests. Playwright specs (tests/*.spec.ts) and the database suite (tests/db) run separately.
export default defineConfig({
  // src/lib/words.ts and wordDetails.ts import the word data in two parts, as on the site.
  plugins: [splitWords()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
