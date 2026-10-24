import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 2,
    testTimeout: 15000,
    hookTimeout: 30000,
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/model-gateway/**/*.test.ts',
      'tests/contract/model-gateway/**/*.test.ts',
      'tests/architecture/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      enabled: true,
      // Pinned V8 subprocess remapping uses Node-native TypeScript transforms,
      // which cannot accurately map the TSX CLI. Keep every source file in
      // this parent-process report; real CLI/process tests prove process behavior.
      autoAttachSubprocess: false,
      include: [
        'src/modules/model-gateway/**/*.ts',
        'src/server/model-gateway.ts',
        'src/server/config.ts',
        'src/server/logger.ts',
        'scripts/check-boundaries.ts',
        'scripts/model-gateway-smoke.ts',
      ],
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage/gateway',
      thresholds: {
        statements: 90,
        lines: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
