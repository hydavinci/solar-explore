import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173';
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: {
    baseURL,
    browserName: 'chromium',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: process.env.PLAYWRIGHT_SERVER_COMMAND ?? 'npm run dev -- --port 4173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  timeout: 45_000,
});
