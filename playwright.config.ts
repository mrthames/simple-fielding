import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3344',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx serve app -l 3344 --no-clipboard',
    port: 3344,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'ipad', use: { browserName: 'chromium', viewport: { width: 1180, height: 820 }, hasTouch: true } },
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
});
