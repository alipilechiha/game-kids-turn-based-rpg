import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const PORT = 4173;

/** Prefer installed Google Chrome when Playwright's Chromium CDN is unreachable. */
const useSystemChrome =
  process.env['PLAYWRIGHT_USE_SYSTEM_CHROME'] === '1' ||
  process.env['PLAYWRIGHT_USE_SYSTEM_CHROME'] === 'true';

const browserUse: NonNullable<PlaywrightTestConfig['use']> = useSystemChrome
  ? { channel: 'chrome' }
  : {};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'fa-IR',
    ...browserUse,
  },
  projects: [
    {
      name: 'landscape-mobile',
      use: {
        ...devices['Galaxy S9+ landscape'],
        viewport: { width: 880, height: 420 },
        isMobile: true,
        hasTouch: true,
        ...browserUse,
      },
    },
    {
      name: 'portrait-mobile',
      use: {
        ...devices['Galaxy S9+'],
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
        ...browserUse,
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    port: PORT,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
