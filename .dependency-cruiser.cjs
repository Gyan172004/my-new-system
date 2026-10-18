module.exports = {
  forbidden: [
    {
      name: 'module-public-interface-external',
      severity: 'error',
      from: { path: '^src/(?!modules/)' },
      to: {
        path: '^src/modules/',
        pathNot: '^src/modules/[^/]+/public\\.ts$',
      },
    },
    {
      name: 'module-public-interface',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/public\\.ts$'],
      },
    },
    {
      name: 'public-no-storage',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/public\\.ts$' },
      to: { path: '^src/modules/[^/]+/persistence/' },
    },
    {
      name: 'provider-adapter-only',
      severity: 'error',
      from: {
        path: '^src/',
        pathNot: '^src/modules/[^/]+/adapters/',
      },
      to: { path: '(^|/)(openai|e2b|@aws-sdk/[^/]+|@clerk/[^/]+)(/|$)' },
    },
    {
      name: 'no-candidate-execution',
      severity: 'error',
      from: { path: '^src/(app/api/|modules/)' },
      to: { path: '^(node:)?(child_process|vm|worker_threads)$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
