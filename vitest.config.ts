import { defineConfig } from 'vitest/config';

// Unit + server tests. Playwright specs (tests/*.spec.ts) and the database suite (tests/db) run separately.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
