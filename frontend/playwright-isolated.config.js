import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 300000, // 5 minutes global timeout
  testDir: './tests/e2e/isolated',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  expect: {
    timeout: 60000, // 1 minute for expect assertions
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['html', { open: 'never' }],
  ],
  use: {
    // baseURL should be the frontend URL so page.goto('/path') hits the app
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 120000, // 2 minutes navigation timeout
    timeout: 180000, // 3 minutes per test timeout
    actionTimeout: 60000, // 1 minute action timeout
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          slowMo: process.env.CI ? 0 : 50,
        },
      },
    },
  ],

  webServer: {
    command: 'PORT=3001 VITE_API_BASE_URL=http://localhost:8001 npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 300000,
  },
  // Global setup/teardown removed for lean smoke tests
});