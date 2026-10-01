import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  timeout: 45000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 1000 },
    locale: 'fa-IR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.CHROMIUM_EXECUTABLE_PATH
      ? {
          launchOptions: {
            executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
            args: ['--no-sandbox', '--disable-gpu'],
          },
        }
      : {}),
  },
  webServer: {
    command: 'npm run build && node scripts/test-server.mjs',
    url: 'http://127.0.0.1:3100/api/health',
    timeout: 60000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
  },
});
