import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 120000,
  testDir: './tests/e2e/isolated',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
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
    navigationTimeout: 45000,
    timeout: 90000,
    actionTimeout: 15000,
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
    timeout: 180000,
  },
  // Global setup/teardown removed for lean smoke tests
});