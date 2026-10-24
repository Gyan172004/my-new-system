import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 2,
    testTimeout: 15000,
    hookTimeout: 30000,
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/identity-*.test.ts',
      'tests/integration/problem-catalogue/pinning.test.ts',
      'tests/integration/problem-catalogue/author-verification.test.ts',
    ],
    coverage: {
      provider: 'v8',
      enabled: true,
      include: [
        'src/modules/identity-profile/**/*.ts',
        'src/modules/interview-session/**/*.ts',
        'src/server/identity-http.ts',
        'src/modules/identity-ui/**/*.{ts,tsx}',
        'src/modules/identity-browser/**/*.ts',
      ],
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage/identity',
      // Browser entries remain visible as not executed in this Node report.
      // Actual UI acceptance is measured separately with Playwright.
      thresholds: {
        '**/{identity-profile,interview-session}/**': {
          statements: 90,
          lines: 90,
          functions: 90,
          branches: 85,
        },
        '**/server/identity-http.ts': {
          statements: 90,
          lines: 90,
          functions: 90,
          branches: 85,
        },
      },
    },
  },
});
