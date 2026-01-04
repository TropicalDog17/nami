import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    timeout: 120000,
    testDir: './tests/e2e',
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
        baseURL: 'http://localhost:3000',
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
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true, // Reuse existing server if available
        timeout: 180000,
        // Note: Backend server on port 8080 must be running externally
    },

    // Global setup/teardown removed; use isolated config for E2E if needed
});
