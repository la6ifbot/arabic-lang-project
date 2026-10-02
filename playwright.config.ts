import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
// Software WebGL so the 3D scene renders on GPU-less CI machines.
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts', // tests/db holds the node:test database suite

  // CI renders the 3D sea in software, and one page load there can take up to 40 s on a slow
  // machine, so a test that loads the sea two or three times needs more than 45 s.
  timeout: process.env.CI ? 90_000 : 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { executablePath, args },
    trace: 'retain-on-failure',
    // Every test starts as a returning visitor, so “How it works” doesn't open over what it checks.
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'durar-help-seen', value: '1' }] }] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run preview -- --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
