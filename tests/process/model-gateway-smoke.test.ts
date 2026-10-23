import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
const run = (args: string[], extra: Record<string, string> = {}) =>
  spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/model-gateway-smoke.ts', ...args],
    {
      env: {
        PATH: process.env.PATH,
        APP_ENV: 'test',
        NODE_ENV: 'test',
        ...extra,
      },
      encoding: 'utf8',
      timeout: 5000,
    },
  );
it('executes an explicit fake probe from a clean process with no database or credentials', () => {
  const result = run(['--adapter', 'fake']);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toMatchObject({
    fixture: 'gateway-probe-v1',
    provider: 'fake',
    outcome: 'success',
    attempts: 1,
  });
});
it.each(
  [
    [],
    ['--adapter', 'fake', '--text', 'CANARY_PAYLOAD'],
    ['--adapter', 'fake', '--api-key', 'CANARY_SECRET'],
    ['--adapter', 'fake', '--count', '6'],
  ].map((args) => ({ args })),
)('rejects invalid CLI $args with a safe nonzero result', ({ args }) => {
  const result = run(args);
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('invalid_smoke_arguments\n');
  expect(result.stdout).toBe('');
  expect(result.stderr).not.toContain('CANARY');
});
it('rejects real providers in test and public secrets without any database target', () => {
  const forbidden = run(['--adapter', 'groq'], { GROQ_API_KEY: 'dummy' });
  expect(forbidden.status).toBe(1);
  expect(forbidden.stderr).toContain('MODEL_GATEWAY_ADAPTER');
  const secret = run(['--adapter', 'fake'], {
    NEXT_PUBLIC_GROQ_API_KEY: 'CANARY',
  });
  expect(secret.status).toBe(1);
  expect(secret.stderr).toContain('NEXT_PUBLIC_GROQ_API_KEY');
  expect(secret.stderr).not.toContain('CANARY');
});

it('handles SIGTERM during an active native request and emits only cancelled evidence', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
    import { smokeMain } from './scripts/model-gateway-smoke.ts';
    globalThis.fetch = async () => {
      setImmediate(() => process.kill(process.pid, 'SIGTERM'));
      return new Promise(() => {});
    };
    process.exitCode = await smokeMain(['--adapter','groq','--count','5'], { APP_ENV:'development', GROQ_API_KEY:'dummy-CANARY_KEY' });
  `,
    ],
    {
      env: { PATH: process.env.PATH, NODE_ENV: 'test' },
      encoding: 'utf8',
      timeout: 5000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('');
  const lines = result.stdout.trim().split('\n');
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0]!)).toMatchObject({
    outcome: 'cancelled',
    attempts: 1,
  });
  expect(result.stdout).not.toContain('CANARY');
});
