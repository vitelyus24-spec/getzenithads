import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60000,
  reporter: [['list'], ['json', { outputFile: '.local/e2e-results.json' }]],
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server/dev.js',
    url: 'http://localhost:5174/api/health',
    timeout: 30000,
    reuseExistingServer: false,
    env: {
      APP_MODE: 'local',
      STORE: 'file',
      DEMO_AUTH: 'true',
      AI_PROVIDER: 'mock',
      PORT: '5174',
      APP_ORIGIN: 'http://localhost:5174',
      LOCAL_DATA_DIR: `.local/e2e-${Date.now()}`,
    },
  },
});
