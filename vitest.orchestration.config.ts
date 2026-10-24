import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 2,
    testTimeout: 15000,
    hookTimeout: 30000,
    include: [
      'tests/unit/interview-orchestration/**/*.test.ts',
      'tests/contract/interview-orchestration/**/*.test.ts',
      'tests/integration/interview-orchestration/**/*.test.ts',
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
        'src/modules/interview-orchestration/**/*.ts',
        'src/modules/model-gateway/application/types.ts',
        'src/modules/model-gateway/application/operations.ts',
        'src/modules/model-gateway/application/invoke.ts',
      ],
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage/orchestration',
      thresholds: {
        statements: 90,
        lines: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
