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
      'tests/integration/problem-catalogue/**/*.test.ts',
      'tests/contract/problem-catalogue.test.ts',
    ],
    coverage: {
      provider: 'v8',
      enabled: true,
      // Pinned V8 subprocess remapping uses Node-native TypeScript transforms,
      // which cannot accurately map the TSX CLI. Keep every source file in
      // this parent-process report; real CLI/HTTP tests prove process behavior.
      autoAttachSubprocess: false,
      include: [
        'src/modules/content-publishing/**/*.ts',
        'src/modules/problem-catalogue/**/*.ts',
        'src/modules/interview-session/**/*.ts',
        'src/server/transaction.ts',
        'src/server/content-staff.ts',
        'src/server/config.ts',
        'src/server/catalogue-http.ts',
        'src/server/http.ts',
        'src/server/logger.ts',
        'src/app/api/v1/problems/**/*.ts',
        'scripts/content-pack.ts',
      ],
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage/catalogue',
      thresholds: {
        statements: 90,
        lines: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
