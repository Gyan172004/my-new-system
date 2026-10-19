import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: process.env.IDENTITY_BROWSER_URL ?? 'http://localhost:3102',
    trace: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: 'node --import tsx tests/helpers/identity-browser-server.ts',
    url: 'http://localhost:3102/api/v1/health/live',
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 40000 },
    timeout: 120000,
    env: {
      APP_ENV: 'test',
      DATABASE_URL: 'postgresql://127.0.0.1:1/unreachable',
      IDENTITY_ADAPTER: 'disabled',
      PORT: '3102',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
