import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config.ts';

/**
 * Opt-in visual documentation config. The regular e2e matrix continues to
 * select only *.spec.ts, not the *.preview.ts screenshot scenario.
 */
export default defineConfig({
  ...baseConfig,
  testMatch: '**/*.preview.ts',
  retries: 0,
  workers: 1,
  projects: [
    {
      name: 'legacy-preview',
      use: {
        ...devices['Galaxy S9+ landscape'],
        viewport: { width: 880, height: 420 },
        locale: 'fa-IR',
        colorScheme: 'light',
      },
    },
  ],
});
