import { defineConfig, devices } from '@playwright/test';

const edgeTests = process.env.QUIZ_EDGE_TEST === 'true';

export default defineConfig({
  testDir: './tests',
  testMatch: edgeTests ? '**/edge-ui.spec.ts' : '**/ui.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5173', channel: 'chrome', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI && !edgeTests,
    env: edgeTests
      ? { VITE_API_BASE_URL: 'https://edge.example.test/functions/v1/quiz' }
      : undefined,
  },
});
