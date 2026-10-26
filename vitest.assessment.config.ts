import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 2,
    testTimeout: 15000,
    hookTimeout: 30000,
    include: [
      'tests/unit/approach-assessment/**/*.test.ts',
      'tests/unit/hints-variants/**/*.test.ts',
      'tests/contract/approach-assessment/**/*.test.ts',
      'tests/contract/assessment-hints.test.ts',
      'tests/integration/approach-assessment/**/*.test.ts',
      'tests/integration/hints-variants/**/*.test.ts',
      'tests/integration/problem-catalogue/assessment-context.test.ts',
      'tests/architecture/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      enabled: true,
      // Pinned V8 subprocess remapping uses Node-native TypeScript transforms,
      // which cannot accurately map the TSX CLI. Keep every source file in
      // this parent-process report; real integration tests prove process behavior.
      autoAttachSubprocess: false,
      include: [
        'src/modules/approach-assessment/**/*.ts',
        'src/modules/hints-variants/**/*.ts',
        'src/modules/conversation/**/*.ts',
        'src/modules/interview-session/application/assessment-commands.ts',
        'src/modules/interview-session/application/hint-commands.ts',
        'src/modules/interview-session/persistence/commands.ts',
        'src/modules/interview-session/domain/dto.ts',
        'src/modules/problem-catalogue/application/assessment-context.ts',
        'src/modules/problem-catalogue/application/hint-routing-installer.ts',
        'src/modules/content-publishing/domain/hint-routing.ts',
        'src/modules/content-publishing/application/hint-routing.ts',
        'src/modules/model-gateway/application/operations.ts',
        'src/modules/model-gateway/application/validation.ts',
      ],
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage/assessment',
      thresholds: {
        statements: 90,
        lines: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
